import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";

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

  // Max 500MB per file
  if (file.size > 500 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 500MB." }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `audio-courses/${timestamp}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type || "audio/mpeg",
  });

  return NextResponse.json({
    url: blob.url,
    filename: file.name,
    size: file.size,
    contentType: file.type,
  });
}
