import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessonAttachments, lessons } from "@/db/schema/courses";
import { eq, and, isNull } from "drizzle-orm";
import path from "path";
import crypto from "crypto";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME = new Set([
  // Documents
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
  // Audio
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
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
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

  try {
    const { lessonId } = await params;

    const [lesson] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null) || file?.name || "Untitled";

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}` },
        { status: 400 },
      );
    }

    const ext = path.extname(file.name);
    const filename = `${crypto.randomUUID()}${ext}`;

    const blob = await put(`lessons/${lessonId}/${filename}`, file, {
      access: "private",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const existingAttachments = await db
      .select({ id: lessonAttachments.id })
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId));

    const [attachment] = await db
      .insert(lessonAttachments)
      .values({
        lessonId,
        title: title.trim(),
        url: blob.url,
        type: "file",
        sortOrder: existingAttachments.length,
      })
      .returning();

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("Error uploading lesson attachment:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
