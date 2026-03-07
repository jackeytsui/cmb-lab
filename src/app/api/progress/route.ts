import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, lessonProgress } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/progress
 *
 * Fetch all lesson progress records for the current user.
 * Includes nested lesson, module, and course information.
 * Requires authentication via Clerk.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get internal user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Query all lesson_progress records for this user with nested relations
    const progress = await db.query.lessonProgress.findMany({
      where: eq(lessonProgress.userId, user.id),
      with: {
        lesson: {
          columns: { id: true, title: true, moduleId: true },
          with: {
            module: {
              columns: { id: true, title: true, courseId: true },
              with: {
                course: {
                  columns: { id: true, title: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Error fetching progress summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress summary" },
      { status: 500 }
    );
  }
}
