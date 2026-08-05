import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreadSteps } from "@/db/schema";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { verifySignedMediaPath } from "@/lib/signed-media-url";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ threadId: string; stepId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  if (
    !verifySignedMediaPath(
      url.pathname,
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
    )
  ) {
    return NextResponse.json(
      { error: "This media link has expired — reload the lesson page." },
      { status: 403 },
    );
  }
  if (request.headers.get("sec-fetch-dest") === "document") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId, stepId } = await params;
  const [step] = await db
    .select({
      videoUrl: videoThreadSteps.videoUrl,
      mediaType: videoThreadSteps.mediaType,
    })
    .from(videoThreadSteps)
    .where(
      and(
        eq(videoThreadSteps.id, stepId),
        eq(videoThreadSteps.threadId, threadId),
      ),
    )
    .limit(1);

  if (!step?.videoUrl) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  if (!isPrivateVercelBlobUrl(step.videoUrl)) {
    return NextResponse.json(
      { error: "This step is not backed by private Blob storage" },
      { status: 400 },
    );
  }

  return proxyBlobMedia(request, step.videoUrl, {
    fallbackContentType:
      step.mediaType === "audio" ? "audio/mp4" : "video/mp4",
    label: "video-threads/media",
  });
}
