import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";

// Allow large uploads and long-running requests
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/admin/audio-course/upload
 * Accepts a single audio file via FormData and uploads it to Vercel Blob.
 * Returns the public URL.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate audio type
  const allowedTypes = [
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
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm|mp4)$/i)) {
    return NextResponse.json(
      { error: "Invalid file type. Please upload an audio file (MP3, M4A, WAV, OGG, AAC, FLAC)." },
      { status: 400 },
    );
  }

  // Max 4.5GB per file (Vercel Blob limit is 5GB, leave headroom)
  if (file.size > 4.5 * 1024 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 4.5GB." }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `audio-courses/${timestamp}-${safeName}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type || "audio/mpeg",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (err) {
    console.error("Audio upload failed:", err);
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
