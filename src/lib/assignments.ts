import { db } from "@/db";
import {
  practiceSets,
  practiceSetAssignments,
  practiceAttempts,
  courseAccess,
  studentTags,
  courses,
  modules,
  lessons,
  users,
  tags,
} from "@/db/schema";
import {
  eq,
  and,
  isNull,
  or,
  inArray,
  desc,
  sql,
} from "drizzle-orm";

// ============================================================
// Types
// ============================================================

export interface ResolvedAssignment {
  assignmentId: string;
  practiceSetId: string;
  practiceSetTitle: string;
  practiceSetDescription: string | null;
  targetType: string;
  targetId: string;
  dueDate: Date | null;
  assignedAt: Date;
  status: "pending" | "completed";
  bestScore: number | null;
  attemptCount: number;
}

const TARGET_TYPE_PRIORITY: Record<string, number> = {
  lesson: 5,
  module: 4,
  course: 3,
  tag: 2,
  student: 1,
};

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];

// ============================================================
// CRUD Functions
// ============================================================

/**
 * Create an assignment linking a published practice set to a target.
 * Validates practice set is published and target entity exists.
 * Catches unique constraint violations (code 23505) gracefully.
 */
export async function createAssignment(data: {
  practiceSetId: string;
  targetType: string;
  targetId: string;
  assignedBy: string;
  dueDate?: Date | null;
}) {
  // Validate targetType
  if (!VALID_TARGET_TYPES.includes(data.targetType)) {
    throw new Error(
      `Invalid targetType: ${data.targetType}. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`
    );
  }

  // Verify practice set exists and not soft-deleted
  const [practiceSet] = await db
    .select({ id: practiceSets.id })
    .from(practiceSets)
    .where(
      and(
        eq(practiceSets.id, data.practiceSetId),
        isNull(practiceSets.deletedAt)
      )
    );

  if (!practiceSet) {
    throw new Error(
      "Practice set not found"
    );
  }

  // Validate target entity exists
  await validateTargetExists(data.targetType, data.targetId);

  // Insert assignment, catching unique constraint violation
  try {
    const [assignment] = await db
      .insert(practiceSetAssignments)
      .values({
        practiceSetId: data.practiceSetId,
        targetType: data.targetType as
          | "course"
          | "module"
          | "lesson"
          | "student"
          | "tag",
        targetId: data.targetId,
        assignedBy: data.assignedBy,
        dueDate: data.dueDate ?? undefined,
      })
      .returning();

    return assignment;
  } catch (error: unknown) {
    // Catch unique constraint violation (Postgres error code 23505)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      throw new Error("Assignment already exists for this practice set and target");
    }
    throw error;
  }
}

/**
 * Hard delete an assignment (assignments are lightweight join records).
 * Returns the deleted row or null if not found.
 */
export async function deleteAssignment(id: string) {
  const [deleted] = await db
    .delete(practiceSetAssignments)
    .where(eq(practiceSetAssignments.id, id))
    .returning();

  return deleted ?? null;
}

/**
 * Update the due date on an existing assignment.
 * Returns the updated row or null if not found.
 */
export async function updateAssignmentDueDate(
  id: string,
  dueDate: Date | null
) {
  const [updated] = await db
    .update(practiceSetAssignments)
    .set({ dueDate })
    .where(eq(practiceSetAssignments.id, id))
    .returning();

  return updated ?? null;
}

/**
 * List all assignments for a given practice set, ordered by createdAt desc.
 */
export async function listAssignmentsForSet(practiceSetId: string) {
  return db
    .select()
    .from(practiceSetAssignments)
    .where(eq(practiceSetAssignments.practiceSetId, practiceSetId))
    .orderBy(desc(practiceSetAssignments.createdAt));
}

// ============================================================
// Student Resolution Query
// ============================================================

/**
 * Resolve ALL assigned practice sets for a student through 5 paths:
 * 1. Direct student assignment
 * 2. Tag-based assignment (via studentTags)
 * 3. Course enrollment (via courseAccess)
 * 4. Module assignment (modules within enrolled courses)
 * 5. Lesson assignment (lessons within enrolled course modules)
 *
 * Deduplicates by practiceSetId, keeping the most specific assignment path.
 */
export async function getStudentAssignments(
  userId: string
): Promise<ResolvedAssignment[]> {
  // Step 1: Collect all valid target entries for this student
  type TargetEntry = { type: string; id: string };
  const targetEntries: TargetEntry[] = [];

  // Direct student assignment
  targetEntries.push({ type: "student", id: userId });

  // Tags and enrollments are independent — fetch in parallel
  const [userTags, enrollments] = await Promise.all([
    db
      .select({ tagId: studentTags.tagId })
      .from(studentTags)
      .where(eq(studentTags.userId, userId)),
    db
      .select({ courseId: courseAccess.courseId })
      .from(courseAccess)
      .where(
        and(
          eq(courseAccess.userId, userId),
          or(
            isNull(courseAccess.expiresAt),
            sql`${courseAccess.expiresAt} > now()`
          )
        )
      ),
  ]);

  for (const t of userTags) {
    targetEntries.push({ type: "tag", id: t.tagId });
  }

  const enrolledCourseIds = enrollments.map((e) => e.courseId);
  for (const courseId of enrolledCourseIds) {
    targetEntries.push({ type: "course", id: courseId });
  }

  // Modules: for enrolled courses, get active modules
  let enrolledModuleIds: string[] = [];
  if (enrolledCourseIds.length > 0) {
    const courseModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(
        and(
          inArray(modules.courseId, enrolledCourseIds),
          isNull(modules.deletedAt)
        )
      );

    enrolledModuleIds = courseModules.map((m) => m.id);
    for (const moduleId of enrolledModuleIds) {
      targetEntries.push({ type: "module", id: moduleId });
    }
  }

  // Lessons: for enrolled modules, get active lessons
  if (enrolledModuleIds.length > 0) {
    const moduleLessons = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(
        and(
          inArray(lessons.moduleId, enrolledModuleIds),
          isNull(lessons.deletedAt)
        )
      );

    for (const lesson of moduleLessons) {
      targetEntries.push({ type: "lesson", id: lesson.id });
    }
  }

  // Step 2: Build OR conditions for practiceSetAssignments query
  // Group by type
  const grouped: Record<string, string[]> = {};
  for (const entry of targetEntries) {
    if (!grouped[entry.type]) {
      grouped[entry.type] = [];
    }
    grouped[entry.type].push(entry.id);
  }

  const orConditions = Object.entries(grouped).map(([type, ids]) =>
    and(
      eq(
        practiceSetAssignments.targetType,
        type as "course" | "module" | "lesson" | "student" | "tag"
      ),
      inArray(practiceSetAssignments.targetId, ids)
    )
  );

  if (orConditions.length === 0) {
    return [];
  }

  // Step 3: Query assignments joined with practice sets
  const assignmentRows = await db
    .select({
      assignmentId: practiceSetAssignments.id,
      practiceSetId: practiceSetAssignments.practiceSetId,
      targetType: practiceSetAssignments.targetType,
      targetId: practiceSetAssignments.targetId,
      dueDate: practiceSetAssignments.dueDate,
      assignedAt: practiceSetAssignments.createdAt,
      practiceSetTitle: practiceSets.title,
      practiceSetDescription: practiceSets.description,
    })
    .from(practiceSetAssignments)
    .innerJoin(
      practiceSets,
      eq(practiceSetAssignments.practiceSetId, practiceSets.id)
    )
    .where(
      and(
        or(...orConditions),
        eq(practiceSets.status, "published"),
        isNull(practiceSets.deletedAt)
      )
    );

  if (assignmentRows.length === 0) {
    return [];
  }

  // Step 4: Get attempt data for the student on these practice sets
  const practiceSetIds = [
    ...new Set(assignmentRows.map((r) => r.practiceSetId)),
  ];

  const attemptData = await db
    .select({
      practiceSetId: practiceAttempts.practiceSetId,
      bestScore: sql<number | null>`max(${practiceAttempts.score})`,
      attemptCount: sql<number>`count(${practiceAttempts.id})::int`,
      hasCompleted:
        sql<number>`count(case when ${practiceAttempts.completedAt} is not null then 1 end)::int`,
    })
    .from(practiceAttempts)
    .where(
      and(
        eq(practiceAttempts.userId, userId),
        inArray(practiceAttempts.practiceSetId, practiceSetIds)
      )
    )
    .groupBy(practiceAttempts.practiceSetId);

  const attemptMap = new Map(
    attemptData.map((a) => [
      a.practiceSetId,
      {
        bestScore: a.bestScore,
        attemptCount: a.attemptCount,
        hasCompleted: a.hasCompleted > 0,
      },
    ])
  );

  // Step 5: Deduplicate by practiceSetId (most specific target wins)
  const deduped = new Map<string, ResolvedAssignment>();

  for (const row of assignmentRows) {
    const attempt = attemptMap.get(row.practiceSetId);
    const resolved: ResolvedAssignment = {
      assignmentId: row.assignmentId,
      practiceSetId: row.practiceSetId,
      practiceSetTitle: row.practiceSetTitle,
      practiceSetDescription: row.practiceSetDescription,
      targetType: row.targetType,
      targetId: row.targetId,
      dueDate: row.dueDate,
      assignedAt: row.assignedAt,
      status: attempt?.hasCompleted ? "completed" : "pending",
      bestScore: attempt?.bestScore ?? null,
      attemptCount: attempt?.attemptCount ?? 0,
    };

    const existing = deduped.get(row.practiceSetId);
    if (!existing) {
      deduped.set(row.practiceSetId, resolved);
    } else {
      // Keep the more specific target (higher priority number wins)
      const existingPriority = TARGET_TYPE_PRIORITY[existing.targetType] ?? 0;
      const currentPriority = TARGET_TYPE_PRIORITY[row.targetType] ?? 0;
      if (currentPriority > existingPriority) {
        deduped.set(row.practiceSetId, resolved);
      }
    }
  }

  // Step 6: Return as array
  return Array.from(deduped.values());
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Validate that a target entity exists based on targetType.
 * Throws an error if the target is not found.
 */
async function validateTargetExists(
  targetType: string,
  targetId: string
): Promise<void> {
  let exists = false;

  switch (targetType) {
    case "course": {
      const [row] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, targetId), isNull(courses.deletedAt)));
      exists = !!row;
      break;
    }
    case "module": {
      const [row] = await db
        .select({ id: modules.id })
        .from(modules)
        .where(and(eq(modules.id, targetId), isNull(modules.deletedAt)));
      exists = !!row;
      break;
    }
    case "lesson": {
      const [row] = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.id, targetId), isNull(lessons.deletedAt)));
      exists = !!row;
      break;
    }
    case "student": {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetId));
      exists = !!row;
      break;
    }
    case "tag": {
      const [row] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.id, targetId));
      exists = !!row;
      break;
    }
  }

  if (!exists) {
    throw new Error(`Target ${targetType} with id ${targetId} not found`);
  }
}
