import { NextRequest, NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { userCanUseFeature } from "@/lib/feature-access";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/accelerator/file?url=<blob-url>
 * Streams a private Vercel Blob file to authenticated users.
 * Uses the same pattern as the working audio-course stream route.
 */
export async function GET(request: NextRequest) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "mandarin_accelerator"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blobUrl = request.nextUrl.searchParams.get("url");
  if (!isPrivateVercelBlobUrl(blobUrl)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const filename = request.nextUrl.searchParams
    .get("name")
    ?.replace(/[^a-zA-Z0-9 ._-]/g, "")
    .slice(0, 180);
  return proxyBlobMedia(request, blobUrl!, {
    fallbackContentType: "application/octet-stream",
    label: "accelerator/file",
    extraHeaders: filename
      ? { "Content-Disposition": `inline; filename="${filename}"` }
      : undefined,
  });
}
