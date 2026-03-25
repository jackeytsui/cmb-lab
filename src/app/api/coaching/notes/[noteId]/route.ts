import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingNotes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    textOverride,
    romanizationOverride,
    translationOverride,
    explanation,
    order,
  } = body as {
    textOverride?: string | null;
    romanizationOverride?: string | null;
    translationOverride?: string | null;
    explanation?: string | null;
    order?: number;
  };

  // Build update payload — only include fields that were explicitly provided
  const updatePayload: Record<string, unknown> = {};
  if ("textOverride" in body) updatePayload.textOverride = textOverride ?? null;
  if ("romanizationOverride" in body) updatePayload.romanizationOverride = romanizationOverride ?? null;
  if ("translationOverride" in body) updatePayload.translationOverride = translationOverride ?? null;
  if ("explanation" in body) updatePayload.explanation = explanation ?? null;
  if (typeof order === "number") updatePayload.order = order;

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
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
