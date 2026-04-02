import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

async function checkAuth(): Promise<boolean> {
  const hasRoleAccess = await hasMinimumRole("coach");
  if (hasRoleAccess) return true;
  const user = await getCurrentUser();
  return !!user;
}

/**
 * GET — preflight check
 */
export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
  }
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * POST — Vercel Blob client-upload token generation.
 * The actual file upload goes from browser → /api/blob-proxy → vercel.com/api/blob
 * (proxy avoids CORS on custom domains).
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        if (!(await checkAuth())) {
          throw new Error("Forbidden");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-msvideo",
            "video/x-matroska",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Upload token error:", err);
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
