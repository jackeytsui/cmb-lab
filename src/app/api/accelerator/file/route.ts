import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 60;

/**
 * GET /api/accelerator/file?url=<blob-url>
 * Streams a private Vercel Blob file to authenticated users.
 * Uses the same pattern as the working audio-course stream route.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blobUrl = request.nextUrl.searchParams.get("url");
  if (!blobUrl || !blobUrl.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const filename = request.nextUrl.searchParams.get("name");

  // Fetch from Vercel Blob with Bearer token — same as audio stream route
  const blobResponse = await fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });

  if (!blobResponse.ok) {
    return new NextResponse("File not found", { status: 404 });
  }

  const responseHeaders = new Headers();
  const contentType = blobResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("content-length", contentLength);
  responseHeaders.set("cache-control", "private, max-age=3600");
  if (filename) {
    responseHeaders.set("content-disposition", `inline; filename="${filename}"`);
  }

  return new NextResponse(blobResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}
