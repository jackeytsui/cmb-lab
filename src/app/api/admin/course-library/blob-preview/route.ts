import { NextRequest, NextResponse } from "next/server";
import { hasCourseContentAccess } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { privateMediaPlaybackRedirect } from "@/lib/private-media-playback";

// Private previews redirect to Blob; the app does not relay video bytes.
export const maxDuration = 60;

/**
 * GET /api/admin/course-library/blob-preview?url=<privateBlobUrl>
 *
 * Staff-only endpoint that plays a private Vercel Blob asset by URL, so the
 * lesson editor can preview a just-uploaded video/audio (which isn't yet saved
 * into lesson content, and whose raw URL needs the store token to fetch).
 * Only supports Vercel Blob, and only for authorized content staff.
 */
export async function GET(request: NextRequest) {
  if (!(await hasCourseContentAccess())) {
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

  if (target.hostname.endsWith(".private.blob.vercel-storage.com")) {
    return privateMediaPlaybackRedirect(target.toString(), "admin/blob-preview", {
      // An unsaved upload may have been replaced in place.
      useCache: false,
    });
  }

  // Preserve legacy public-asset previews.
  return proxyBlobMedia(request, target.toString(), {
    fallbackContentType: "application/octet-stream",
    label: "admin/blob-preview",
    // Previews are of unsaved uploads — never cache them.
    extraHeaders: { "Cache-Control": "private, no-store" },
  });
}
