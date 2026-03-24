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
 * POST /api/admin/audio-course/upload
 * Handles Vercel Blob client-upload token generation.
 * This enables large uploads directly from browser -> Blob and avoids 413 errors on Vercel functions.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const hasRoleAccess = await hasMinimumRole("coach");
        const user = await getCurrentUser();
        if (!hasRoleAccess && !user) {
          throw new Error("Forbidden");
        }

        if (!isValidPathname(pathname)) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ALLOWED_AUDIO_CONTENT_TYPES,
          maximumSizeInBytes: MAX_AUDIO_SIZE_BYTES,
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
