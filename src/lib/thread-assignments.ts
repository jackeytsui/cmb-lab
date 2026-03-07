import { db } from "@/db";
import {
  threadAssignments,
  videoThreads,
  videoThreadSessions,
  videoThreadResponses,
  courses,
  modules,
  lessons,
  users,
  tags,
  courseAccess,
  studentTags,
} from "@/db/schema";
import { eq, and, or, isNull, inArray, desc, sql, count } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

export interface ResolvedThreadAssignment {
  assignmentId: string;
  threadId: string;
  threadTitle: string;
  threadDescription: string | null;
  notes: string | null;
  dueDate: Date | null;
  assignedAt: Date;
  completionStatus: "not_started" | "in_progress" | "completed";
}

export interface StudentThreadProgress {
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  completionStatus: "not_started" | "in_progress" | "completed";
  responseCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ThreadAssignmentProgressResult {
  assignment: {
    id: string;
    threadId: string;
    threadTitle: string;
    dueDate: Date | null;
  };
  students: StudentThreadProgress[];
}

// ============================================================
// Constants
// ============================================================

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];

const TARGET_TYPE_PRIORITY: Record<string, number> = {
  lesson: 5,
  module: 4,
  course: 3,
  tag: 2,
  student: 1,
};

// ============================================================
// CRUD Functions
// ============================================================

/**
 * Create a thread assignment linking a video thread to a target.
 * Validates target type and target entity existence.
 * Catches unique constraint violations (code 23505) gracefully.
 */
export async function createThreadAssignment(data: {
  threadId: string;
  targetType: string;
  targetId: string;
  assignedBy: string;
  notes?: string | null;
  dueDate?: Date | null;
}) {
  // Validate targetType
  if (!VALID_TARGET_TYPES.includes(data.targetType)) {
    throw new Error(
      `Invalid targetType: ${data.targetType}. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`
    );
  }

  // Validate target entity exists
  await validateTargetExists(data.targetType, data.targetId);

  // Insert assignment, catching unique constraint violation
  try {
    const [assignment] = await db
      .insert(threadAssignments)
      .values({
        threadId: data.threadId,
        targetType: data.targetType as
          | "course"
          | "module"
          | "lesson"
          | "student"
          | "tag",
        targetId: data.targetId,
        assignedBy: data.assignedBy,
        notes: data.notes ?? undefined,
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
      throw new Error("This thread is already assigned to this target");
    }
    throw error;
  }
}

/**
 * Hard delete a thread assignment.
 * Returns the deleted row or null if not found.
 */
export async function deleteThreadAssignment(id: string) {
  const [deleted] = await db
    .delete(threadAssignments)
    .where(eq(threadAssignments.id, id))
    .returning();

  return deleted ?? null;
}

/**
 * List all thread assignments created by a specific coach.
 * JOINs videoThreads for title. Ordered by createdAt desc.
 */
export async function listCoachThreadAssignments(coachId: string) {
  return db
    .select({
      id: threadAssignments.id,
      threadId: threadAssignments.threadId,
      threadTitle: videoThreads.title,
      targetType: threadAssignments.targetType,
      targetId: threadAssignments.targetId,
      notes: threadAssignments.notes,
      dueDate: threadAssignments.dueDate,
      createdAt: threadAssignments.createdAt,
    })
    .from(threadAssignments)
    .innerJoin(videoThreads, eq(videoThreads.id, threadAssignments.threadId))
    .where(eq(threadAssignments.assignedBy, coachId))
    .orderBy(desc(threadAssignments.createdAt));
}

// ============================================================
// Student Resolution Query
// ============================================================

/**
 * Resolve ALL assigned threads for a student through 5 target paths:
 * 1. Direct student assignment
 * 2. Tag-based assignment (via studentTags)
 * 3. Course enrollment (via courseAccess)
 * 4. Module assignment (modules within enrolled courses)
 * 5. Lesson assignment (lessons within enrolled course modules)
 *
 * LEFT JOINs videoThreadSessions for completion status.
 * Deduplicates by threadId, keeping most specific target.
 */
export async function getStudentThreadAssignments(
  userId: string
): Promise<ResolvedThreadAssignment[]> {
  // Step 1: Collect all valid target entries for this student
  type TargetEntry = { type: string; id: string };
  const targetEntries: TargetEntry[] = [];

  // Direct student assignment
  targetEntries.push({ type: "student", id: userId });

  // Tags and enrollments are independent -- fetch in parallel
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

  // Step 2: Build OR conditions for threadAssignments query
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
        threadAssignments.targetType,
        type as "course" | "module" | "lesson" | "student" | "tag"
      ),
      inArray(threadAssignments.targetId, ids)
    )
  );

  if (orConditions.length === 0) {
    return [];
  }

  // Step 3: Query assignments LEFT JOIN videoThreadSessions for status
  const assignmentRows = await db
    .select({
      assignmentId: threadAssignments.id,
      threadId: threadAssignments.threadId,
      threadTitle: videoThreads.title,
      threadDescription: videoThreads.description,
      notes: threadAssignments.notes,
      dueDate: threadAssignments.dueDate,
      assignedAt: threadAssignments.createdAt,
      targetType: threadAssignments.targetType,
      sessionStatus: videoThreadSessions.status,
    })
    .from(threadAssignments)
    .innerJoin(videoThreads, eq(videoThreads.id, threadAssignments.threadId))
    .leftJoin(
      videoThreadSessions,
      and(
        eq(videoThreadSessions.threadId, threadAssignments.threadId),
        eq(videoThreadSessions.studentId, userId)
      )
    )
    .where(or(...orConditions));

  if (assignmentRows.length === 0) {
    return [];
  }

  // Step 4: Deduplicate by threadId (most specific target wins)
  const deduped = new Map<string, ResolvedThreadAssignment>();
  const targetTypePriorityMap = new Map<string, number>();

  for (const row of assignmentRows) {
    // Derive completion status from session
    let completionStatus: "not_started" | "in_progress" | "completed" = "not_started";
    if (row.sessionStatus === "completed") {
      completionStatus = "completed";
    } else if (row.sessionStatus === "in_progress") {
      completionStatus = "in_progress";
    }

    const resolved: ResolvedThreadAssignment = {
      assignmentId: row.assignmentId,
      threadId: row.threadId,
      threadTitle: row.threadTitle,
      threadDescription: row.threadDescription,
      notes: row.notes,
      dueDate: row.dueDate,
      assignedAt: row.assignedAt,
      completionStatus,
    };

    const existing = deduped.get(row.threadId);
    if (!existing) {
      deduped.set(row.threadId, resolved);
      targetTypePriorityMap.set(row.threadId, TARGET_TYPE_PRIORITY[row.targetType] ?? 0);
    } else {
      const currentPriority = TARGET_TYPE_PRIORITY[row.targetType] ?? 0;
      if (currentPriority > (targetTypePriorityMap.get(row.threadId) ?? 0)) {
        deduped.set(row.threadId, resolved);
        targetTypePriorityMap.set(row.threadId, currentPriority);
      }
    }
  }

  return Array.from(deduped.values());
}

// ============================================================
// Coach Progress Query
// ============================================================

/**
 * Get per-student progress for a specific thread assignment.
 * Resolves target students based on targetType, LEFT JOINs videoThreadSessions
 * and counts videoThreadResponses per session.
 */
export async function getThreadAssignmentProgress(
  assignmentId: string
): Promise<ThreadAssignmentProgressResult | null> {
  // Step 1: Get the assignment details
  const [assignment] = await db
    .select({
      id: threadAssignments.id,
      threadId: threadAssignments.threadId,
      threadTitle: videoThreads.title,
      dueDate: threadAssignments.dueDate,
      targetType: threadAssignments.targetType,
      targetId: threadAssignments.targetId,
    })
    .from(threadAssignments)
    .innerJoin(videoThreads, eq(videoThreads.id, threadAssignments.threadId))
    .where(eq(threadAssignments.id, assignmentId));

  if (!assignment) {
    return null;
  }

  // Step 2: Resolve all target students
  const targetStudents = await resolveTargetStudents(
    assignment.targetType,
    assignment.targetId
  );

  if (targetStudents.length === 0) {
    return {
      assignment: {
        id: assignment.id,
        threadId: assignment.threadId,
        threadTitle: assignment.threadTitle,
        dueDate: assignment.dueDate,
      },
      students: [],
    };
  }

  // Step 3: Get thread session data for all target students
  const studentIds = targetStudents.map((s) => s.id);
  const sessions = await db
    .select({
      studentId: videoThreadSessions.studentId,
      sessionId: videoThreadSessions.id,
      status: videoThreadSessions.status,
      startedAt: videoThreadSessions.startedAt,
      completedAt: videoThreadSessions.completedAt,
    })
    .from(videoThreadSessions)
    .where(
      and(
        eq(videoThreadSessions.threadId, assignment.threadId),
        inArray(videoThreadSessions.studentId, studentIds)
      )
    );

  // Step 4: Count responses per session
  const sessionIds = sessions.map((s) => s.sessionId);
  let responseCounts = new Map<string, number>();
  if (sessionIds.length > 0) {
    const counts = await db
      .select({
        sessionId: videoThreadResponses.sessionId,
        responseCount: count(videoThreadResponses.id),
      })
      .from(videoThreadResponses)
      .where(inArray(videoThreadResponses.sessionId, sessionIds))
      .groupBy(videoThreadResponses.sessionId);

    responseCounts = new Map(
      counts.map((c) => [c.sessionId, c.responseCount])
    );
  }

  const sessionMap = new Map(
    sessions.map((s) => [s.studentId, s])
  );

  // Step 5: Build per-student progress
  const students: StudentThreadProgress[] = targetStudents.map((student) => {
    const session = sessionMap.get(student.id);
    let completionStatus: "not_started" | "in_progress" | "completed" = "not_started";
    if (session?.status === "completed") {
      completionStatus = "completed";
    } else if (session?.status === "in_progress") {
      completionStatus = "in_progress";
    }

    return {
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      completionStatus,
      responseCount: session ? (responseCounts.get(session.sessionId) ?? 0) : 0,
      startedAt: session?.startedAt ?? null,
      completedAt: session?.completedAt ?? null,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      threadId: assignment.threadId,
      threadTitle: assignment.threadTitle,
      dueDate: assignment.dueDate,
    },
    students,
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Resolve all students who are targets of an assignment.
 * Handles all 5 target types: student, tag, course, module, lesson.
 */
async function resolveTargetStudents(
  targetType: string,
  targetId: string
): Promise<{ id: string; name: string | null; email: string }[]> {
  switch (targetType) {
    case "student": {
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, targetId));
      return user ? [user] : [];
    }

    case "tag": {
      return db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(studentTags, eq(studentTags.userId, users.id))
        .where(eq(studentTags.tagId, targetId));
    }

    case "course": {
      return db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(courseAccess, eq(courseAccess.userId, users.id))
        .where(
          and(
            eq(courseAccess.courseId, targetId),
            or(
              isNull(courseAccess.expiresAt),
              sql`${courseAccess.expiresAt} > now()`
            )
          )
        );
    }

    case "module": {
      // Find parent course, then query enrolled students
      const [mod] = await db
        .select({ courseId: modules.courseId })
        .from(modules)
        .where(and(eq(modules.id, targetId), isNull(modules.deletedAt)));
      if (!mod) return [];

      return db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(courseAccess, eq(courseAccess.userId, users.id))
        .where(
          and(
            eq(courseAccess.courseId, mod.courseId),
            or(
              isNull(courseAccess.expiresAt),
              sql`${courseAccess.expiresAt} > now()`
            )
          )
        );
    }

    case "lesson": {
      // Find parent module, then parent course, then enrolled students
      const [les] = await db
        .select({ moduleId: lessons.moduleId })
        .from(lessons)
        .where(and(eq(lessons.id, targetId), isNull(lessons.deletedAt)));
      if (!les) return [];

      const [mod] = await db
        .select({ courseId: modules.courseId })
        .from(modules)
        .where(and(eq(modules.id, les.moduleId), isNull(modules.deletedAt)));
      if (!mod) return [];

      return db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(courseAccess, eq(courseAccess.userId, users.id))
        .where(
          and(
            eq(courseAccess.courseId, mod.courseId),
            or(
              isNull(courseAccess.expiresAt),
              sql`${courseAccess.expiresAt} > now()`
            )
          )
        );
    }

    default:
      return [];
  }
}

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
