import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { scriptLines } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { userCanUseFeature } from "@/lib/feature-access";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/accelerator/scripts/stream/[lineId]?field=cantonese|mandarin
 *
 * Authenticated proxy for private Vercel Blob script-line audio clips.
 * Forwards Range for seeking. Stream URL is stable across regenerations
 * (clients cache by lineId+field, not by underlying blob URL).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> },
) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "mandarin_accelerator"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lineId } = await params;
  if (!z.string().uuid().safeParse(lineId).success) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }
  const field = request.nextUrl.searchParams.get("field");
  if (field !== "cantonese" && field !== "mandarin") {
    return NextResponse.json(
      { error: "field=cantonese|mandarin required" },
      { status: 400 },
    );
  }

  const line = await db.query.scriptLines.findFirst({
    where: eq(scriptLines.id, lineId),
    columns: { cantoneseAudioUrl: true, mandarinAudioUrl: true },
  });
  if (!line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  const url =
    field === "cantonese" ? line.cantoneseAudioUrl : line.mandarinAudioUrl;
  if (!url || !isPrivateVercelBlobUrl(url)) {
    return NextResponse.json(
      { error: `No ${field} audio uploaded for this line` },
      { status: 404 },
    );
  }

  return proxyBlobMedia(request, url, {
    fallbackContentType: "audio/mpeg",
    label: "accelerator/scripts/stream",
    extraHeaders: {
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": "inline",
    },
  });
}
