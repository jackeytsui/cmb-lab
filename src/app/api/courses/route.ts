import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, courses, courseAccess } from "@/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";

/**
 * GET /api/courses
 * Returns courses the authenticated user has valid access to.
 * Excludes:
 * - Deleted courses (deletedAt is set)
 * - Expired access grants (expiresAt < now)
 */
export async function GET() {
  // Get current user's clerkId
  const { userId: clerkId } = await auth();

  // Require authentication
  if (!clerkId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Query courses user has valid access to
    // Join: courseAccess -> users (to match clerkId) -> courses
    // Filter: user matches, course not deleted, access not expired
    const userCourses = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        thumbnailUrl: courses.thumbnailUrl,
        isPublished: courses.isPublished,
        accessTier: courseAccess.accessTier,
        expiresAt: courseAccess.expiresAt,
        createdAt: courses.createdAt,
      })
      .from(courseAccess)
      .innerJoin(users, eq(courseAccess.userId, users.id))
      .innerJoin(courses, eq(courseAccess.courseId, courses.id))
      .where(
        and(
          // User matches by clerkId
          eq(users.clerkId, clerkId),
          // Course is not deleted
          isNull(courses.deletedAt),
          // Access is not expired (null = lifetime, or future date)
          or(
            isNull(courseAccess.expiresAt),
            gt(courseAccess.expiresAt, new Date())
          )
        )
      );

    return NextResponse.json({ courses: userCourses });
  } catch (error) {
    console.error("Error fetching user courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
