import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
];

/**
 * GET /api/admin/accelerator/settings/upload
 * Pre-flight check — verifies auth + blob token before upload starts.
 */
export async function GET() {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured. Ask admin to set BLOB_READ_WRITE_TOKEN." },
        { status: 500 },
      );
    }

    const hasRoleAccess = await hasMinimumRole("coach");
    if (!hasRoleAccess) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Upload pre-flight check failed:", err);
    return NextResponse.json(
      { error: `Pre-flight check failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/accelerator/settings/upload
 * Handles Vercel Blob client-upload token generation for PDFs and videos.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured. Ask admin to set BLOB_READ_WRITE_TOKEN." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        const hasRoleAccess = await hasMinimumRole("coach");
        if (!hasRoleAccess) {
          const user = await getCurrentUser();
          if (!user) {
            throw new Error("Forbidden");
          }
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Content upload failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
