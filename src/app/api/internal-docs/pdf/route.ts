import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/internal-docs/pdf?url=<blob-url>
 * Proxies a private Vercel Blob PDF to authorized coaches and admins.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = request.nextUrl.searchParams.get("url");
  if (!isPrivateVercelBlobUrl(url)) {
    return NextResponse.json({ error: "Invalid PDF URL" }, { status: 400 });
  }

  return proxyBlobMedia(request, url!, {
    fallbackContentType: "application/pdf",
    label: "internal-docs/pdf",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
