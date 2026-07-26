import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { videoThreadSteps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";

// Each invocation serves at most one bounded chunk (see blob-media-proxy).
export const maxDuration = 60;

/**
 * GET /api/video-threads/stream/[stepId]
 * Authenticated chunked-range proxy for thread step videos stored in the
 * private Vercel Blob store (VideoAsk migration). Mirrors the
 * course-library stream route: the step row keeps the raw private blob URL
 * and the player is given this proxy URL instead.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stepId } = await params;

  const [step] = await db
    .select({ videoUrl: videoThreadSteps.videoUrl })
    .from(videoThreadSteps)
    .where(eq(videoThreadSteps.id, stepId))
    .limit(1);

  if (!step) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const videoUrl = step.videoUrl;
  if (!videoUrl || !videoUrl.includes(".blob.vercel-storage.com")) {
    return NextResponse.json(
      { error: "No blob video for this step" },
      { status: 404 },
    );
  }

  return proxyBlobMedia(request, videoUrl, {
    fallbackContentType: "video/mp4",
    label: "video-threads/stream",
  });
}
