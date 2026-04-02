import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { head } from "@vercel/blob";

export const maxDuration = 60;

/**
 * GET /api/accelerator/file?url=<blob-url>
 * Fetches a private blob and streams it to authenticated users.
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

  try {
    // Verify blob exists and get metadata
    const metadata = await head(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Fetch the actual file content using the downloadUrl
    const res = await fetch(metadata.downloadUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("content-type", metadata.contentType || "application/pdf");
    headers.set("cache-control", "private, max-age=3600");

    return new NextResponse(res.body, { status: 200, headers });
  } catch (err) {
    console.error("File proxy error:", err);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
