import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingSessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { sanitizeRecordingUrl } from "@/lib/recording-embed";
import { isStaffRole } from "@/lib/platform-roles";

const optionalHttpUrlSchema = z
  .union([z.string().trim().max(2_000), z.null()])
  .optional()
  .refine(
    (value) =>
      value === undefined ||
      value === null ||
      value === "" ||
      sanitizeRecordingUrl(value) !== null,
    "Link must be a valid http or https URL.",
  );

const updateSessionSchema = z.object({
  title: z.string().trim().max(200).optional(),
  recordingUrl: optionalHttpUrlSchema,
  goals: z.union([z.string().trim().max(50_000), z.null()]).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSessionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid session update." },
      { status: 400 },
    );
  }
  const { title, recordingUrl, goals } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title || "Session";
  if (recordingUrl !== undefined) {
    updates.recordingUrl = recordingUrl
      ? sanitizeRecordingUrl(recordingUrl)
      : null;
  }
  if (goals !== undefined) updates.goals = goals || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(coachingSessions)
    .set(updates)
    .where(
      dbUser.role === "admin"
        ? eq(coachingSessions.id, sessionId)
        : and(
            eq(coachingSessions.id, sessionId),
            eq(coachingSessions.createdBy, dbUser.id),
          ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (dbUser.role === "admin") {
    const deleted = await db
      .delete(coachingSessions)
      .where(eq(coachingSessions.id, sessionId))
      .returning({ id: coachingSessions.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // Coach can only delete sessions they created.
  const deleted = await db
    .delete(coachingSessions)
    .where(and(eq(coachingSessions.id, sessionId), eq(coachingSessions.createdBy, dbUser.id)))
    .returning({ id: coachingSessions.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Session not found or not owned by you" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
