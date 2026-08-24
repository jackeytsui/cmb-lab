import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingNotes, coachingSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { z } from "zod";
import { isStaffRole } from "@/lib/platform-roles";

const updateNoteSchema = z
  .object({
    textOverride: z.string().max(20_000).nullable().optional(),
    romanizationOverride: z.string().max(20_000).nullable().optional(),
    translationOverride: z.string().max(20_000).nullable().optional(),
    explanation: z.string().max(20_000).nullable().optional(),
    order: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

async function canManageNote(
  noteId: string,
  user: { id: string; role: string },
): Promise<boolean> {
  const [note] = await db
    .select({ createdBy: coachingSessions.createdBy })
    .from(coachingNotes)
    .innerJoin(
      coachingSessions,
      eq(coachingNotes.sessionId, coachingSessions.id),
    )
    .where(eq(coachingNotes.id, noteId))
    .limit(1);
  return Boolean(
    note && (user.role === "admin" || note.createdBy === user.id),
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canManageNote(noteId, dbUser))) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const parsed = updateNoteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note update" }, { status: 400 });
  }
  const body = parsed.data;
  const {
    textOverride,
    romanizationOverride,
    translationOverride,
    explanation,
    order,
  } = body;

  // Build update payload — only include fields that were explicitly provided
  const updatePayload: Record<string, unknown> = {};
  if ("textOverride" in body) updatePayload.textOverride = textOverride ?? null;
  if ("romanizationOverride" in body) updatePayload.romanizationOverride = romanizationOverride ?? null;
  if ("translationOverride" in body) updatePayload.translationOverride = translationOverride ?? null;
  if ("explanation" in body) updatePayload.explanation = explanation ?? null;
  if (typeof order === "number") updatePayload.order = order;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(coachingNotes)
    .set(updatePayload)
    .where(eq(coachingNotes.id, noteId))
    .returning();

  return NextResponse.json({ note: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canManageNote(noteId, dbUser))) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const [deleted] = await db
    .delete(coachingNotes)
    .where(eq(coachingNotes.id, noteId))
    .returning({ id: coachingNotes.id });

  if (!deleted) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
