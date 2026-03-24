import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * POST /api/admin/audio-course/lessons/bulk
 *
 * Actions:
 *   delete  — Bulk delete lessons and their blob audio files
 *   reorder — Update sortOrder for a list of lessons
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const action = body.action as string;

  // ---- BULK DELETE ----
  if (action === "delete") {
    const lessonIds = body.lessonIds as string[];
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: "lessonIds required" }, { status: 400 });
    }

    // Get audio URLs before deleting
    const rows = await db
      .select({ id: lessons.id, content: lessons.content })
      .from(lessons)
      .where(and(inArray(lessons.id, lessonIds), isNull(lessons.deletedAt)));

    // Soft-delete all
    await db
      .update(lessons)
      .set({ deletedAt: new Date() })
      .where(inArray(lessons.id, lessonIds));

    // Clean up blob storage in background
    const blobUrls = rows
      .map((r) => {
        try {
          const parsed = JSON.parse(r.content ?? "{}") as { audioUrl?: string };
          return typeof parsed.audioUrl === "string" ? parsed.audioUrl : null;
        } catch {
          return null;
        }
      })
      .filter((u): u is string => !!u);

    if (blobUrls.length > 0) {
      del(blobUrls, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((err) =>
        console.error("[bulk-delete] blob cleanup failed:", err),
      );
    }

    return NextResponse.json({ deleted: lessonIds.length });
  }

  // ---- REORDER ----
  if (action === "reorder") {
    const order = body.order as { id: string; sortOrder: number }[];
    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "order required" }, { status: 400 });
    }

    await Promise.all(
      order.map((item) =>
        db
          .update(lessons)
          .set({ sortOrder: item.sortOrder })
          .where(eq(lessons.id, item.id)),
      ),
    );

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
