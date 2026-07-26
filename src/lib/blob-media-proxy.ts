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

/** Max bytes served per invocation for range requests.
 *  Sized so a chunk finishes well inside the function timeout even on slow
 *  links: 4MB needs only ~0.1 Mbps sustained against a 300s maxDuration. A
 *  chunk cut off by the timeout reaches the browser as a truncated 206 body,
 *  which Chrome surfaces as PIPELINE_ERROR_READ / "FFmpegDemuxer: data source
 *  error" — the exact failure this bound exists to prevent. */
export const CHUNK_BYTES = 4 * 1024 * 1024; // 4MB

interface ProxyOptions {
  /** Content-Type to use when upstream doesn't send one. */
  fallbackContentType: string;
  /** Route label used in server logs, e.g. "course-library/stream". */
  label: string;
  /** Extra response headers (e.g. Content-Disposition). */
  extraHeaders?: Record<string, string>;
}

/**
 * Clamp a range request to at most CHUNK_BYTES per invocation:
 * - open-ended `bytes=N-` becomes `bytes=N-(N+CHUNK_BYTES-1)`
 * - bounded `bytes=N-M` is shortened when the span exceeds CHUNK_BYTES
 *   (a browser asking for hundreds of MB in one request would otherwise hit
 *   the same mid-stream timeout the chunking exists to prevent; it simply
 *   re-requests the rest, exactly like the open-ended case)
 * - suffix ranges (`bytes=-N`, used to grab the moov atom at the tail of an
 *   MP4) and anything unparseable pass through untouched — upstream decides.
 */
export function clampRangeHeader(range: string): string {
  const trimmed = range.trim();
  const open = /^bytes=(\d+)-$/.exec(trimmed);
  if (open) {
    const start = Number(open[1]);
    if (!Number.isFinite(start)) return range;
    return `bytes=${start}-${start + CHUNK_BYTES - 1}`;
  }
  const bounded = /^bytes=(\d+)-(\d+)$/.exec(trimmed);
  if (bounded) {
    const start = Number(bounded[1]);
    const end = Number(bounded[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return range;
    }
    return `bytes=${start}-${Math.min(end, start + CHUNK_BYTES - 1)}`;
  }
  return range;
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
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error(
      `[${options.label}] BLOB_READ_WRITE_TOKEN is not set — cannot fetch private blobs`,
    );
    return NextResponse.json(
      { error: "Media storage is not configured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = clampRangeHeader(range);

  let blobResponse: Response;
  try {
    blobResponse = await fetch(blobUrl, { headers });
  } catch (err) {
    console.error(`[${options.label}] Blob fetch failed:`, err);
    return NextResponse.json(
      { error: "Failed to reach media storage" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 416 Range Not Satisfiable must be forwarded so the browser can recover
  // (it re-requests without a range or with a corrected one).
  if (blobResponse.status === 416) {
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const contentRange = blobResponse.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    return new NextResponse(null, { status: 416, headers: responseHeaders });
  }

  if (!blobResponse.ok) {
    // Log the real upstream status (403 = bad/rotated token, 404 = blob
    // deleted, 5xx = storage outage) so production logs pinpoint the cause,
    // but return 502 to the client: an upstream 403 is NOT the student's
    // permission problem.
    const snippet = (await blobResponse.text().catch(() => ""))
      .slice(0, 300)
      .replace(/\s+/g, " ");
    console.error(
      `[${options.label}] Blob storage returned ${blobResponse.status} for ${blobUrl.split("?")[0]}: ${snippet}`,
    );
    return NextResponse.json(
      { error: "Failed to fetch media", upstreamStatus: blobResponse.status },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResponse.headers.get("content-type") ?? options.fallbackContentType,
  );
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set(
    "Accept-Ranges",
    blobResponse.headers.get("accept-ranges") ?? "bytes",
  );
  const etag = blobResponse.headers.get("etag");
  if (etag) responseHeaders.set("ETag", etag);
  const lastModified = blobResponse.headers.get("last-modified");
  if (lastModified) responseHeaders.set("Last-Modified", lastModified);
  // Partial (206) chunk windows are never cached: a cached window replayed
  // for a different byte offset corrupts playback, and the windows shift
  // whenever CHUNK_BYTES changes. Full responses stay cacheable.
  responseHeaders.set(
    "Cache-Control",
    blobResponse.status === 206 ? "no-store" : "private, max-age=3600",
  );
  for (const [key, value] of Object.entries(options.extraHeaders ?? {})) {
    responseHeaders.set(key, value);
  }

  // One compact line per invocation so a playback failure can be matched to
  // the exact request/response shape in the Vercel logs (the browser-side
  // demuxer error alone doesn't say which byte range died).
  console.log(
    `[${options.label}] range=${range ?? "none"} → ${blobResponse.status}` +
      ` content-range=${contentRange ?? "none"} content-length=${contentLength ?? "none"}`,
  );

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
