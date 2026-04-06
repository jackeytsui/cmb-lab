import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

const MAX_AUDIO_SIZE_BYTES = 4.5 * 1024 * 1024 * 1024;
const PATHNAME_PREFIX = "audio-courses/";
const ALLOWED_AUDIO_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/webm",
];

function isValidPathname(pathname: string): boolean {
  // Ensure uploads stay inside the expected folder and block path traversal.
  return pathname.startsWith(PATHNAME_PREFIX) && !pathname.includes("..");
}

/**
 * GET /api/admin/audio-course/upload
 * Pre-flight check — verifies auth + blob token are working before uploads start.
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
 * POST /api/admin/audio-course/upload
 * Handles Vercel Blob client-upload token generation.
 * This enables large uploads directly from browser -> Blob and avoids 413 errors on Vercel functions.
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
      onBeforeGenerateToken: async (pathname) => {
        const hasRoleAccess = await hasMinimumRole("coach");
        if (!hasRoleAccess) {
          const user = await getCurrentUser();
          if (!user) {
            throw new Error("Forbidden");
          }
        }

        if (!isValidPathname(pathname)) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ALLOWED_AUDIO_CONTENT_TYPES,
          maximumSizeInBytes: MAX_AUDIO_SIZE_BYTES,
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
    if (message === "Invalid upload path") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Audio upload token generation failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
