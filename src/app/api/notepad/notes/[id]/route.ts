import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notepadNotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

/**
 * PATCH /api/notepad/notes/:id
 * Body may include: textOverride, romanizationOverride, translationOverride,
 *                   explanation, starred (0|1), order
 * Only the note's owner can update. Unknown keys ignored.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<{
    textOverride: string | null;
    romanizationOverride: string | null;
    translationOverride: string | null;
    explanation: string | null;
    starred: number;
    order: number;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if ("textOverride" in body) {
    updates.textOverride =
      typeof body.textOverride === "string" && body.textOverride.trim()
        ? body.textOverride
        : null;
  }
  if ("romanizationOverride" in body) {
    updates.romanizationOverride =
      typeof body.romanizationOverride === "string" && body.romanizationOverride.trim()
        ? body.romanizationOverride
        : null;
  }
  if ("translationOverride" in body) {
    updates.translationOverride =
      typeof body.translationOverride === "string" && body.translationOverride.trim()
        ? body.translationOverride
        : null;
  }
  if ("explanation" in body) {
    updates.explanation =
      typeof body.explanation === "string" && body.explanation.trim()
        ? body.explanation
        : null;
  }
  if ("starred" in body) {
    updates.starred = body.starred ? 1 : 0;
  }
  if ("order" in body && typeof body.order === "number") {
    updates.order = Math.round(body.order);
  }

  try {
    const [updated] = await db
      .update(notepadNotes)
      .set(updates)
      .where(and(eq(notepadNotes.id, id), eq(notepadNotes.userId, user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: updated });
  } catch (err) {
    console.error("[notepad/notes PATCH] failed:", err);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/notepad/notes/:id — owner only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deleted] = await db
      .delete(notepadNotes)
      .where(and(eq(notepadNotes.id, id), eq(notepadNotes.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notepad/notes DELETE] failed:", err);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 },
    );
  }
}
