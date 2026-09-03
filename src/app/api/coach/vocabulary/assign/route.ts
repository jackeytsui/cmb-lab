import { studentAssignedToCoach } from "@/lib/coach-student-sql";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vocabularyListAssignments, vocabularyLists, users } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { z } from "zod";
import { isStaffRole } from "@/lib/platform-roles";

const assignListSchema = z.object({
  listId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1).max(200),
  dueDate: z.string().datetime({ offset: true }).nullish(),
});

export async function POST(req: Request) {
  const currentUser = await getRealUser();
  if (!currentUser) return new NextResponse("Unauthorized", { status: 401 });
  if (!isStaffRole(currentUser.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = assignListSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }
  const { listId, dueDate } = parsed.data;
  const studentIds = [...new Set(parsed.data.studentIds)];

  const list = await db.query.vocabularyLists.findFirst({
    where:
      currentUser.role === "admin"
        ? eq(vocabularyLists.id, listId)
        : and(
            eq(vocabularyLists.id, listId),
            eq(vocabularyLists.userId, currentUser.id),
          ),
    columns: { id: true },
  });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const studentConditions = [
    inArray(users.id, studentIds),
    eq(users.role, "student"),
    isNull(users.deletedAt),
  ];
  if (currentUser.role !== "admin") {
    studentConditions.push(studentAssignedToCoach(currentUser.id));
  }
  const eligibleStudents = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...studentConditions));
  if (eligibleStudents.length !== studentIds.length) {
    return NextResponse.json(
      { error: "One or more students are not assignable" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ studentId: vocabularyListAssignments.assignedToUserId })
    .from(vocabularyListAssignments)
    .where(
      and(
        eq(vocabularyListAssignments.listId, listId),
        inArray(vocabularyListAssignments.assignedToUserId, studentIds),
      ),
    );
  const alreadyAssigned = new Set(existing.map((row) => row.studentId));
  const newStudentIds = studentIds.filter((id) => !alreadyAssigned.has(id));
  if (newStudentIds.length === 0) {
    return NextResponse.json({ assignments: [], alreadyAssigned: studentIds.length });
  }

  // Insert assignments for each student
  // Note: Drizzle's insert().values() accepts an array of objects
  const newAssignments = await db
    .insert(vocabularyListAssignments)
    .values(
      newStudentIds.map((studentId) => ({
        listId,
        assignedToUserId: studentId,
        assignedByUserId: currentUser.id,
        dueDate: dueDate ? new Date(dueDate) : null,
      }))
    )
    .returning();

  return NextResponse.json({
    assignments: newAssignments,
    alreadyAssigned: alreadyAssigned.size,
  });
}
