import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, lessons, courseAccess, interactions } from "@/db/schema";
import { eq, and, isNull, asc, or, gt } from "drizzle-orm";
import { ReaderClient } from "./ReaderClient";
import { FeatureGate } from "@/components/auth/FeatureGate";

interface PageProps {
  searchParams: Promise<{ lessonId?: string }>;
}

/**
 * Reader page — server component with auth guard.
 *
 * Checks Clerk authentication and redirects unauthenticated users
 * to /sign-in. When a lessonId searchParam is provided, fetches
 * the lesson's interaction prompts server-side (with access control)
 * and passes them as initialText to the ReaderClient.
 *
 * Silent fallback: if lessonId is invalid or user lacks access,
 * the reader renders normally (empty) without error.
 */
export default async function ReaderPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  let initialText = "";

  if (params.lessonId) {
    try {
      // 1. Get internal user
      const user = await db.query.users.findFirst({
        where: eq(users.clerkId, userId),
        columns: { id: true },
      });

      if (user) {
        // 2. Fetch lesson with module and course context
        const lesson = await db.query.lessons.findFirst({
          where: and(
            eq(lessons.id, params.lessonId),
            isNull(lessons.deletedAt),
          ),
          with: {
            module: {
              with: {
                course: true,
              },
            },
          },
        });

        if (lesson) {
          // 3. Verify course access
          const access = await db.query.courseAccess.findFirst({
            where: and(
              eq(courseAccess.userId, user.id),
              eq(courseAccess.courseId, lesson.module.course.id),
              or(
                isNull(courseAccess.expiresAt),
                gt(courseAccess.expiresAt, new Date()),
              ),
            ),
          });

          if (access) {
            // 4. Fetch interactions and extract unique prompts
            const lessonInteractions = await db.query.interactions.findMany({
              where: and(
                eq(interactions.lessonId, params.lessonId),
                isNull(interactions.deletedAt),
              ),
              orderBy: [asc(interactions.timestamp)],
              columns: { prompt: true },
            });

            const uniquePrompts = lessonInteractions
              .map((i) => i.prompt)
              .filter(Boolean)
              .filter((text, idx, arr) => arr.indexOf(text) === idx);

            if (uniquePrompts.length > 0) {
              initialText = uniquePrompts.join("\n\n");
            }
          }
        }
      }
    } catch (error) {
      // Silent fallback — reader works standalone without lesson text
      console.error("Failed to load lesson text for reader:", error);
    }
  }

  return (
    <FeatureGate feature="dictionary_reader">
      <ReaderClient initialText={initialText || undefined} />
    </FeatureGate>
  );
}
