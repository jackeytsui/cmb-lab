import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scriptLines } from "@/db/schema";

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
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lineId } = await params;
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
  if (!url) {
    return NextResponse.json(
      { error: `No ${field} audio uploaded for this line` },
      { status: 404 },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobResponse = await fetch(url, { headers });

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  const contentType = blobResponse.headers.get("content-type") || "audio/mpeg";
  responseHeaders.set("Content-Type", contentType);

  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const acceptRanges = blobResponse.headers.get("accept-ranges");
  responseHeaders.set("Accept-Ranges", acceptRanges || "bytes");

  // Short TTL because regenerate-audio swaps the underlying URL in place
  responseHeaders.set("Cache-Control", "private, max-age=60");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
