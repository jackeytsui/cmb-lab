import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { practiceAttempts, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

// POST /api/practice/[setId]/attempts/[attemptId]/save
// Auto-save a single answer to an active attempt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string; attemptId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { attemptId } = await params;
  const { exerciseId, response } = await request.json();

  if (!exerciseId || response === undefined) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // Upsert the answer into the JSONB 'answers' column
    // Using jsonb_set to merge or update the specific key
    await db
      .update(practiceAttempts)
      .set({
        answers: sql`jsonb_set(
          COALESCE(${practiceAttempts.answers}, '{}'::jsonb),
          array[${exerciseId}],
          ${JSON.stringify(response)}::jsonb
        )`,
      })
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.userId, currentUser.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to auto-save answer:", error);
    return NextResponse.json(
      { error: "Failed to save answer" },
      { status: 500 }
    );
  }
}
