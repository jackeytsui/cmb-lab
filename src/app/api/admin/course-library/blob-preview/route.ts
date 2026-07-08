import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/admin/course-library/blob-preview?url=<privateBlobUrl>
 *
 * Admin-only proxy that streams a private Vercel Blob asset by URL, so the
 * lesson editor can preview a just-uploaded video/audio (which isn't yet saved
 * into lesson content, and whose raw URL needs the store token to fetch).
 * Only proxies our own Vercel Blob host, and only for admins. Forwards Range
 * for seeking.
 */
export async function GET(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".vercel-storage.com")
  ) {
    return NextResponse.json({ error: "Unsupported url" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobResponse = await fetch(target.toString(), { headers });
  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResponse.headers.get("content-type") ?? "application/octet-stream",
  );
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set(
    "Accept-Ranges",
    blobResponse.headers.get("accept-ranges") ?? "bytes",
  );
  responseHeaders.set("Cache-Control", "private, no-store");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
