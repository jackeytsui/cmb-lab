import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDownloadUrl } from "@vercel/blob";

/**
 * GET /api/accelerator/file?url=<blob-url>
 * Generates a temporary signed download URL for private blob files.
 * Redirects the browser to the signed URL.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blobUrl = request.nextUrl.searchParams.get("url");
  if (!blobUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  if (!blobUrl.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const downloadUrl = await getDownloadUrl(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.redirect(downloadUrl);
  } catch (err) {
    console.error("Failed to get download URL:", err);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
