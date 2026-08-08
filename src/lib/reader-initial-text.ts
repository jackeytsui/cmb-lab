import "server-only";

import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { courseAccess, interactions, lessons, users } from "@/db/schema";

/** Load lesson prompts into the reader only when the signed-in user has access. */
export async function getReaderInitialText(
  clerkUserId: string,
  lessonId?: string,
): Promise<string> {
  if (!lessonId) return "";
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
      columns: { id: true },
    });
    if (!user) return "";

    const lesson = await db.query.lessons.findFirst({
      where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
      with: { module: { with: { course: true } } },
    });
    if (!lesson) return "";

    const access = await db.query.courseAccess.findFirst({
      where: and(
        eq(courseAccess.userId, user.id),
        eq(courseAccess.courseId, lesson.module.course.id),
        or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date())),
      ),
    });
    if (!access) return "";

    const rows = await db.query.interactions.findMany({
      where: and(
        eq(interactions.lessonId, lessonId),
        isNull(interactions.deletedAt),
      ),
      orderBy: [asc(interactions.timestamp)],
      columns: { prompt: true },
    });
    return rows
      .map((row) => row.prompt)
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .join("\n\n");
  } catch (error) {
    console.error("Failed to load lesson text for reader:", error);
    return "";
  }
}
