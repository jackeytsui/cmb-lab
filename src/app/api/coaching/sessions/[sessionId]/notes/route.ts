import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingNotes, coachingSessions, users } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { text, pane } = body as { text?: string; pane?: "mandarin" | "cantonese" };
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }
  if (pane !== "mandarin" && pane !== "cantonese") {
    return NextResponse.json({ error: "Invalid pane" }, { status: 400 });
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
      text: text.trim(),
    })
    .returning();

  await db
    .update(coachingSessions)
    .set({ updatedAt: new Date() })
    .where(eq(coachingSessions.id, sessionId));

  return NextResponse.json({ note });
}
