import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ListeningPracticeConfig } from "@/lib/assignment-types";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { canAccessLesson, resolvePermissions } from "@/lib/permissions";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/assignments/[lessonId]/listening-audio
 * Authenticated proxy for the Listening Practice audio blob.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!z.string().uuid().safeParse(lessonId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role !== "admin" && user.role !== "coach") {
    const permissions = await resolvePermissions(user.id);
    if (!(await canAccessLesson(permissions, lessonId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { lessonType: true, assignmentConfig: true },
  });

  if (!lesson || lesson.lessonType !== "listening_practice") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let config: ListeningPracticeConfig | null = null;
  try {
    config = lesson.assignmentConfig ? JSON.parse(lesson.assignmentConfig) : null;
  } catch {
    return NextResponse.json({ error: "Invalid config" }, { status: 500 });
  }

  if (!config?.audioBlobUrl || !isPrivateVercelBlobUrl(config.audioBlobUrl)) {
    return NextResponse.json({ error: "No audio uploaded for this lesson" }, { status: 404 });
  }

  return proxyBlobMedia(request, config.audioBlobUrl, {
    fallbackContentType: "audio/mpeg",
    label: "assignments/listening-audio",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
