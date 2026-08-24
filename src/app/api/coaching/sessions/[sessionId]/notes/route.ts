import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingNotes, coachingSessions } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { z } from "zod";
import { isStaffRole } from "@/lib/platform-roles";

const createNoteSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  pane: z.enum(["mandarin", "cantonese"]),
});

export async function POST(
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

  const parsed = createNoteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  }
  const { text, pane } = parsed.data;

  const session = await db.query.coachingSessions.findFirst({
    where: eq(coachingSessions.id, sessionId),
    columns: { id: true, createdBy: true },
  });
  if (
    !session ||
    (dbUser.role !== "admin" && session.createdBy !== dbUser.id)
  ) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const latest = await db
    .select({ order: coachingNotes.order })
    .from(coachingNotes)
    .where(and(eq(coachingNotes.sessionId, sessionId), eq(coachingNotes.pane, pane)))
    .orderBy(desc(coachingNotes.order))
    .limit(1);

  const nextOrder = latest.length > 0 ? latest[0].order + 1 : 1;

  const [note] = await db
    .insert(coachingNotes)
    .values({
      sessionId,
      pane,
      order: nextOrder,
      text,
    })
    .returning();

  await db
    .update(coachingSessions)
    .set({ updatedAt: new Date() })
    .where(eq(coachingSessions.id, sessionId));

  return NextResponse.json({ note });
}
