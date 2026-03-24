import { NextRequest, NextResponse } from "next/server";
import { uploadPart } from "@vercel/blob";
import { auth } from "@clerk/nextjs/server";

// Edge Runtime — no body size limit, streams the chunk through.
// Auth is a lightweight Clerk session check (the create endpoint
// already verified the user has coach role).
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pathname = request.nextUrl.searchParams.get("pathname");
  const uploadId = request.nextUrl.searchParams.get("uploadId");
  const key = request.nextUrl.searchParams.get("key");
  const partNumber = Number(request.nextUrl.searchParams.get("partNumber"));

  if (!pathname || !uploadId || !key || !partNumber) {
    return NextResponse.json(
      { error: "pathname, uploadId, key, partNumber required" },
      { status: 400 },
    );
  }

  try {
    const body = await request.arrayBuffer();

    const result = await uploadPart(pathname, Buffer.from(body), {
      access: "private",
      uploadId,
      key,
      partNumber,
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    return NextResponse.json({
      etag: result.etag,
      partNumber: result.partNumber,
    });
  } catch (err) {
    console.error(`[upload-part] part ${partNumber} failed:`, err);
    const message = err instanceof Error ? err.message : "Upload part failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
