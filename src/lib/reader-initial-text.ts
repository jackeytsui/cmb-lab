import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { interactions, lessons, users } from "@/db/schema";
import { canAccessLesson, resolvePermissions } from "@/lib/permissions";
import { hasFullFeatureAccess } from "@/lib/platform-roles";

/** Load lesson prompts into the reader only when the signed-in user has access. */
export async function getReaderInitialText(
  clerkUserId: string,
  lessonId?: string,
): Promise<string> {
  if (!lessonId) return "";
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
      columns: { id: true, role: true },
    });
    if (!user) return "";

    const lesson = await db.query.lessons.findFirst({
      where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
      columns: { id: true },
    });
    if (!lesson) return "";

    if (!hasFullFeatureAccess(user.role)) {
      const permissions = await resolvePermissions(user.id);
      if (!(await canAccessLesson(permissions, lessonId))) return "";
    }

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
