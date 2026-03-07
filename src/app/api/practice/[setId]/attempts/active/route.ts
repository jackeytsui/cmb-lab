import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { practiceAttempts, users } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

// GET /api/practice/[setId]/attempts/active
// Check for an incomplete attempt for this practice set
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
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

  const { setId } = await params;

  try {
    const activeAttempt = await db.query.practiceAttempts.findFirst({
      where: and(
        eq(practiceAttempts.practiceSetId, setId),
        eq(practiceAttempts.userId, currentUser.id),
        isNull(practiceAttempts.completedAt)
      ),
      orderBy: [desc(practiceAttempts.startedAt)],
    });

    if (!activeAttempt) {
      return NextResponse.json({ attempt: null });
    }

    return NextResponse.json({ attempt: activeAttempt });
  } catch (error) {
    console.error("Failed to check active attempt:", error);
    return NextResponse.json(
      { error: "Failed to check active attempt" },
      { status: 500 }
    );
  }
}
