import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vocabularyListAssignments, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return new NextResponse("Unauthorized", { status: 401 });

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (!currentUser) return new NextResponse("User not found", { status: 404 });

  const { listId, studentIds, dueDate } = await req.json();

  if (!listId || !studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return new NextResponse("Invalid request: listId and studentIds required", { status: 400 });
  }

  // Insert assignments for each student
  // Note: Drizzle's insert().values() accepts an array of objects
  const newAssignments = await db
    .insert(vocabularyListAssignments)
    .values(
      studentIds.map((studentId: string) => ({
        listId,
        assignedToUserId: studentId,
        assignedByUserId: currentUser.id,
        dueDate: dueDate ? new Date(dueDate) : null,
      }))
    )
    .returning();

  return NextResponse.json({ assignments: newAssignments });
}
