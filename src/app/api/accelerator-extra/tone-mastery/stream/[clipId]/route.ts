import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { toneMasteryClips } from "@/db/schema";

/**
 * GET /api/accelerator-extra/tone-mastery/stream/[clipId]
 * Authenticated proxy for private Vercel Blob tone mastery video clips.
 * Supports Range headers for seeking / partial playback.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;

  const clip = await db.query.toneMasteryClips.findFirst({
    where: eq(toneMasteryClips.id, clipId),
    columns: { videoUrl: true },
  });

  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const videoUrl = clip.videoUrl;
  if (!videoUrl || videoUrl === "placeholder") {
    return NextResponse.json(
      { error: "No video uploaded for this clip yet" },
      { status: 404 },
    );
  }

  // Fetch from Vercel Blob with the token
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };

  // Forward Range header for seeking support
  const range = request.headers.get("range");
  if (range) {
    headers["Range"] = range;
  }

  const blobResponse = await fetch(videoUrl, { headers });

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: blobResponse.status },
    );
  }

  // Stream the response back with proper headers
  const responseHeaders = new Headers();
  const contentType = blobResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  else responseHeaders.set("Content-Type", "video/mp4");

  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const acceptRanges = blobResponse.headers.get("accept-ranges");
  if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);
  else responseHeaders.set("Accept-Ranges", "bytes");

  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
