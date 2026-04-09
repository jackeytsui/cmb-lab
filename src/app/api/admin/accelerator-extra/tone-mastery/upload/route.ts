import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

/**
 * POST /api/admin/accelerator-extra/tone-mastery/upload
 * Vercel Blob client-upload token generation for tone mastery video clips.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        const hasAccess = await hasMinimumRole("coach");
        if (!hasAccess) {
          throw new Error("Forbidden");
        }
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/quicktime",
            "video/webm",
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Tone mastery upload error:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
