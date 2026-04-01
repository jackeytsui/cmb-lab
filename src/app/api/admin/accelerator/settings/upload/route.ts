import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 500 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
        tokenPayload: JSON.stringify({ source: "accelerator-pdf" }),
      }),
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("PDF upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload PDF" },
      { status: 500 }
    );
  }
}
