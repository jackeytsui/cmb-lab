import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 60;

/**
 * POST /api/assignments/recording-upload-token
 *
 * Signs a client-upload token so the browser PUTs student recordings (Vocal
 * Hack takes, Diary reads) directly to Vercel Blob via @vercel/blob/client.
 * Vercel serverless routes cap request bodies at ~4.5MB, so longer recordings
 * (e.g. a 5-minute diary read) must go direct rather than through a server
 * POST. Any authenticated user may upload; pathnames are scoped to
 * assignment-recordings/ and stored private.
 */
const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB ceiling for a recording
const PATHNAME_PREFIX = "assignment-recordings/";
const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "video/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
];

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Forbidden");
        if (!pathname.startsWith(PATHNAME_PREFIX) || pathname.includes("..")) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
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
    console.error("[assignments/recording-upload-token] failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
