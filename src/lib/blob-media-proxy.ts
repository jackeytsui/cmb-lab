// src/lib/blob-media-proxy.ts
// Shared streaming proxy for long-form media stored in the private Vercel
// Blob store (course videos, lesson audio, admin previews).
//
// Why this exists: these files are hundreds of MB, but a Vercel function
// invocation is capped by `maxDuration`. The old proxies forwarded the
// browser's open-ended `Range: bytes=0-` request verbatim, so a single
// invocation tried to stream the ENTIRE file and was killed mid-transfer when
// the cap hit — the student's player then sat on a spinner with no metadata
// and no error. This proxy instead clamps open-ended range requests to a
// bounded chunk. The 206 response carries the real total size in
// Content-Range, so the browser simply issues sequential follow-up range
// requests — every invocation now transfers at most CHUNK_BYTES and finishes
// well inside the timeout.
//
// It also surfaces upstream failures (rotated BLOB_READ_WRITE_TOKEN, deleted
// blob, storage outage) as explicit JSON errors + server logs instead of
// letting the player spin forever, so the next incident is diagnosable from
// the Vercel logs and the on-screen message.

import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

/** Max bytes served per invocation for range requests. Small chunks finish
 * well inside the function timeout even on slow connections; a timeout would
 * otherwise deliver a truncated 206 body and Chromium reports that as an
 * FFmpegDemuxer data-source error. */
export const CHUNK_BYTES = 4 * 1024 * 1024;
/** Keep the first metadata probe small. Chromium waits for this response to
 * finish before it asks for an MP4's tail `moov` atom; a multi-megabyte first
 * window can therefore leave the player at readyState=0 even though the
 * endpoint itself is returning a healthy 206. */
export const INITIAL_CHUNK_BYTES = 512 * 1024;

function chunkBytesForStart(start: number) {
  return start === 0 ? INITIAL_CHUNK_BYTES : CHUNK_BYTES;
}

interface ProxyOptions {
  /** Content-Type to use when upstream doesn't send one. */
  fallbackContentType: string;
  /** Route label used in server logs, e.g. "course-library/stream". */
  label: string;
  /** Extra response headers (e.g. Content-Disposition). */
  extraHeaders?: Record<string, string>;
}

/**
 * Clamp both open-ended and large bounded ranges to CHUNK_BYTES. Suffix ranges
 * (used to locate an MP4 moov atom at the tail) and invalid inputs pass
 * through for the upstream server to handle.
 */
export function clampRangeHeader(range: string): string {
  const trimmed = range.trim();
  const open = /^bytes=(\d+)-$/.exec(trimmed);
  if (open) {
    const start = Number(open[1]);
    if (!Number.isFinite(start)) return range;
    return `bytes=${start}-${start + chunkBytesForStart(start) - 1}`;
  }

  const bounded = /^bytes=(\d+)-(\d+)$/.exec(trimmed);
  if (bounded) {
    const start = Number(bounded[1]);
    const end = Number(bounded[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return range;
    }
    return `bytes=${start}-${Math.min(
      end,
      start + chunkBytesForStart(start) - 1,
    )}`;
  }

  return range;
}

export interface NormalizedContentRange {
  value: string;
  contentLength: number;
}

/**
 * Vercel Blob can occasionally describe a tail response relative to the
 * requested offset (for example `bytes 193069056-797056/797057`). That is not
 * a valid HTTP Content-Range and Chromium discards it, then retries the same
 * metadata probe several seconds later. Convert that specific relative form
 * back to absolute byte positions before forwarding it to the browser.
 */
export function normalizeContentRange(
  contentRange: string | null,
): NormalizedContentRange | null {
  if (!contentRange) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(
    contentRange.trim(),
  );
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? null : Number(match[3]);
  if (![start, end].every(Number.isSafeInteger)) return null;

  if (
    total !== null &&
    Number.isSafeInteger(total) &&
    start > 0 &&
    end < start &&
    end + 1 === total
  ) {
    const absoluteEnd = start + end;
    const absoluteTotal = start + total;
    return {
      value: `bytes ${start}-${absoluteEnd}/${absoluteTotal}`,
      contentLength: total,
    };
  }

  if (end < start) return null;
  return {
    value: `bytes ${start}-${end}/${total ?? "*"}`,
    contentLength: end - start + 1,
  };
}

/**
 * Stream a private Vercel Blob through an authenticated, chunk-bounded proxy
 * response. Callers are responsible for auth/authorization checks — this
 * only handles the blob fetch + response plumbing.
 */
export async function proxyBlobMedia(
  request: NextRequest,
  blobUrl: string,
  options: ProxyOptions,
): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || /\s/.test(token)) {
    console.error(
      `[${options.label}] BLOB_READ_WRITE_TOKEN is not set — cannot fetch private blobs`,
    );
    return NextResponse.json(
      { error: "Media storage is not configured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers: Record<string, string> = {};
  const range = request.headers.get("range");
  if (range) headers["Range"] = clampRangeHeader(range);

  let blobResult: Awaited<ReturnType<typeof get>>;
  try {
    // Use the Blob SDK's Undici-backed private read rather than Next's
    // enhanced global fetch. The latter can leave larger authenticated range
    // reads pending indefinitely even though tiny probes succeed.
    blobResult = await get(blobUrl, {
      access: "private",
      token,
      useCache: false,
      headers,
    });
  } catch (err) {
    const upstreamStatus =
      err instanceof Error
        ? Number(/Failed to fetch blob: (\d{3})/.exec(err.message)?.[1]) || null
        : null;
    if (upstreamStatus === 416) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error(
      `[${options.label}] Blob fetch failed:`,
      upstreamStatus ? `upstream ${upstreamStatus}` : "UnknownError",
    );
    return NextResponse.json(
      {
        error: "Failed to reach media storage",
        ...(upstreamStatus ? { upstreamStatus } : {}),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!blobResult || blobResult.statusCode === 304 || !blobResult.stream) {
    const upstreamStatus = blobResult ? blobResult.statusCode : 404;
    console.error(
      `[${options.label}] Blob storage returned ${upstreamStatus} for ${blobUrl.split("?")[0]}`,
    );
    return NextResponse.json(
      { error: "Failed to fetch media", upstreamStatus },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  // @vercel/blob currently reports statusCode 200 for successful range reads;
  // the raw Content-Range header is the authoritative 206 signal.
  const blobStatus = blobResult.headers.has("content-range") ? 206 : 200;

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResult.headers.get("content-type") ?? options.fallbackContentType,
  );
  const rawContentRange = blobResult.headers.get("content-range");
  const normalizedContentRange = normalizeContentRange(rawContentRange);
  const contentRange = normalizedContentRange?.value ?? rawContentRange;
  const contentLength =
    blobResult.headers.get("content-length") ??
    (blobStatus === 206 && normalizedContentRange
      ? String(normalizedContentRange.contentLength)
      : null);
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set(
    "Accept-Ranges",
    blobResult.headers.get("accept-ranges") ?? "bytes",
  );
  const etag = blobResult.headers.get("etag");
  if (etag) responseHeaders.set("ETag", etag);
  const lastModified = blobResult.headers.get("last-modified");
  if (lastModified) responseHeaders.set("Last-Modified", lastModified);
  // Never cache partial windows. A stale window replayed for another byte
  // offset corrupts the media stream; complete responses remain cacheable.
  responseHeaders.set(
    "Cache-Control",
    blobStatus === 206 ? "no-store" : "private, max-age=3600",
  );
  for (const [key, value] of Object.entries(options.extraHeaders ?? {})) {
    responseHeaders.set(key, value);
  }

  console.log(
    `[${options.label}] range=${range ?? "none"} -> ${blobStatus}` +
      ` content-range=${contentRange ?? "none"} content-length=${contentLength ?? "none"}`,
  );

  return new NextResponse(blobResult.stream, {
    status: blobStatus,
    headers: responseHeaders,
  });
}
