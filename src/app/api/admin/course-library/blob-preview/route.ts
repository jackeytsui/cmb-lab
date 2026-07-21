import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";

// Each invocation serves at most one bounded chunk (see blob-media-proxy), so
// 60s is ample headroom even for large video previews.
export const maxDuration = 60;

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

  return proxyBlobMedia(request, target.toString(), {
    fallbackContentType: "application/octet-stream",
    label: "admin/blob-preview",
    // Previews are of unsaved uploads — never cache them.
    extraHeaders: { "Cache-Control": "private, no-store" },
  });
}
