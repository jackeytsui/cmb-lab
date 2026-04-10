import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/admin/course-library/upload?kind=video|file|image
 *
 * Server-side upload to Vercel Blob (access: "private"). Matches the
 * tone-mastery upload-server pattern that's known to work with the
 * CMB Lab private blob store.
 */

const VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);
const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
// For "file" kind, accept a reasonable whitelist for course downloads.
const FILE_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

const MAX_SIZE = {
  video: 500 * 1024 * 1024, // 500MB
  file: 100 * 1024 * 1024, // 100MB
  image: 10 * 1024 * 1024, // 10MB
} as const;

export async function POST(request: NextRequest) {
  try {
    const hasAccess = await hasMinimumRole("admin");
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage not configured" },
        { status: 500 },
      );
    }

    const kind = (request.nextUrl.searchParams.get("kind") ?? "file") as
      | "video"
      | "file"
      | "image";
    if (kind !== "video" && kind !== "file" && kind !== "image") {
      return NextResponse.json(
        { error: "Invalid kind. Must be video, file, or image." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate content type
    const allowed =
      kind === "video" ? VIDEO_MIME : kind === "image" ? IMAGE_MIME : FILE_MIME;
    if (!allowed.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported content type for ${kind}: ${file.type}` },
        { status: 400 },
      );
    }

    // Validate size
    const maxSize = MAX_SIZE[kind];
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${maxSize / 1024 / 1024}MB for ${kind})`,
        },
        { status: 400 },
      );
    }

    const blob = await put(`course-library/${kind}/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      sizeBytes: file.size,
      contentType: file.type,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[Course Library] Upload error:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
