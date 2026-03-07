import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessonAttachments, lessons } from "@/db/schema/courses";
import { eq, and, isNull } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { lessonId } = await params;

    // Verify lesson exists
    const [lesson] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string || file?.name || "Untitled";

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name);
    // Sanitize filename or use UUID
    const filename = `${crypto.randomUUID()}${ext}`;
    const relativePath = `uploads/lessons/${lessonId}/${filename}`;
    const fullPath = path.join(process.cwd(), "public", relativePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    const publicUrl = `/${relativePath}`;

    // Determine sort order
    const existingAttachments = await db
      .select({ id: lessonAttachments.id })
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId));

    // Insert attachment
    const [attachment] = await db
      .insert(lessonAttachments)
      .values({
        lessonId,
        title: title.trim(),
        url: publicUrl,
        type: "file",
        sortOrder: existingAttachments.length,
      })
      .returning();

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
