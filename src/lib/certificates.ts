import { db } from "@/db";
import {
  certificates,
  users,
  courses,
  modules,
  lessons,
  lessonProgress,
} from "@/db/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export type { Certificate } from "@/db/schema/certificates";

/**
 * Check if a user has completed all lessons in a course.
 * A course is complete when every non-deleted lesson in every non-deleted module
 * has a lessonProgress record with completedAt set.
 */
export async function checkCourseCompletion(
  userId: string,
  courseId: string
): Promise<boolean> {
  // Get all non-deleted lessons in non-deleted modules for this course
  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(modules.courseId, courseId),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt)
      )
    );

  if (allLessons.length === 0) {
    return false; // No lessons means not completable
  }

  // Get completed lesson count for this user
  const completedLessons = await db
    .select({ id: lessonProgress.lessonId })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(modules.courseId, courseId),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt),
        isNotNull(lessonProgress.completedAt)
      )
    );

  return completedLessons.length >= allLessons.length;
}

/**
 * Create a certificate for a user who completed a course.
 * - Throws if user has not completed all lessons
 * - Idempotent: returns existing certificate if one already exists
 */
export async function createCertificate(
  userId: string,
  courseId: string
): Promise<typeof certificates.$inferSelect> {
  // Verify completion
  const isComplete = await checkCourseCompletion(userId, courseId);
  if (!isComplete) {
    throw new Error("Course is not fully completed");
  }

  // Look up user name and course title for snapshot
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    throw new Error("User not found");
  }

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) {
    throw new Error("Course not found");
  }

  const studentName = user.name || user.email;
  const courseTitle = course.title;
  const verificationId = nanoid(12);

  // Insert with ON CONFLICT DO NOTHING for idempotency
  const result = await db
    .insert(certificates)
    .values({
      userId,
      courseId,
      verificationId,
      studentName,
      courseTitle,
      completedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [certificates.userId, certificates.courseId],
    })
    .returning();

  // If conflict (cert already exists), return the existing one
  if (result.length === 0) {
    const existing = await db.query.certificates.findFirst({
      where: and(
        eq(certificates.userId, userId),
        eq(certificates.courseId, courseId)
      ),
    });
    if (!existing) {
      throw new Error("Certificate conflict but not found");
    }
    return existing;
  }

  return result[0];
}

/**
 * Look up a certificate by its public verification ID.
 */
export async function getCertificateByVerificationId(
  verificationId: string
): Promise<typeof certificates.$inferSelect | null> {
  const cert = await db.query.certificates.findFirst({
    where: eq(certificates.verificationId, verificationId),
  });
  return cert ?? null;
}

/**
 * Get all certificates for a user, ordered by completion date descending.
 */
export async function getCertificatesForUser(
  userId: string
): Promise<(typeof certificates.$inferSelect)[]> {
  return db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(sql`${certificates.completedAt} DESC`);
}
