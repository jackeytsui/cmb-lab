import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { toneMasteryClips } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { userCanUseFeature } from "@/lib/feature-access";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/accelerator-extra/tone-mastery/stream/[clipId]
 * Authenticated proxy for private Vercel Blob tone mastery video clips.
 * Supports Range headers for seeking / partial playback.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "tone_mastery"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clipId } = await params;
  if (!z.string().uuid().safeParse(clipId).success) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const clip = await db.query.toneMasteryClips.findFirst({
    where: eq(toneMasteryClips.id, clipId),
    columns: { videoUrl: true },
  });

  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const videoUrl = clip.videoUrl;
  if (!videoUrl || !isPrivateVercelBlobUrl(videoUrl)) {
    return NextResponse.json(
      { error: "No video uploaded for this clip yet" },
      { status: 404 },
    );
  }

  return proxyBlobMedia(request, videoUrl, {
    fallbackContentType: "video/mp4",
    label: "accelerator-extra/tone-mastery/stream",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
