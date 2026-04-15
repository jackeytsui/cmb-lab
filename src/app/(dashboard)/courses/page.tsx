import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, courses, modules, lessons, lessonProgress } from "@/db/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { CourseCard } from "@/components/course/CourseCard";
import { ErrorAlert } from "@/components/ui/error-alert";
import { BookOpen } from "lucide-react";
import { resolvePermissions } from "@/lib/permissions";
import { hasMinimumRole } from "@/lib/auth";
import { userHasLtoStudentTag } from "@/lib/tag-feature-access";

export const metadata = {
  title: "My Courses | Canto to Mando",
};

/**
 * My Courses page - displays all courses the user has access to.
 * Uses resolvePermissions() to union role-based + direct courseAccess grants.
 * Coaches/admins see all courses.
 */
export default async function MyCoursesPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/sign-in");
  }

  try {
    // Look up internal user
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });
    if (!user) {
      redirect("/sign-in");
    }

    // Coaches see all courses
    const isCoachOrAbove = await hasMinimumRole("coach");

    // Classic LTO students don't get regular courses — send them to Accelerator
    if (!isCoachOrAbove && (await userHasLtoStudentTag(user.id))) {
      redirect("/dashboard/accelerator");
    }

    let userCourses: {
      id: string;
      title: string;
      description: string | null;
      thumbnailUrl: string | null;
      totalLessons: number;
      completedLessons: number;
    }[];

    let permissions: Awaited<ReturnType<typeof resolvePermissions>> | null = null;

    if (isCoachOrAbove) {
      // Coaches/admins: show all non-deleted courses
      userCourses = await db
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          thumbnailUrl: courses.thumbnailUrl,
          totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`.as("total_lessons"),
          completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`.as("completed_lessons"),
        })
        .from(courses)
        .leftJoin(modules, eq(modules.courseId, courses.id))
        .leftJoin(lessons, eq(lessons.moduleId, modules.id))
        .leftJoin(
          lessonProgress,
          and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, user.id))
        )
        .where(isNull(courses.deletedAt))
        .groupBy(courses.id, courses.title, courses.description, courses.thumbnailUrl);
    } else {
      // Students: resolve permissions (union of roles + direct courseAccess)
      permissions = await resolvePermissions(user.id);

      if (permissions.hasWildcardAccess) {
        // Wildcard: show all non-deleted courses
        userCourses = await db
          .select({
            id: courses.id,
            title: courses.title,
            description: courses.description,
            thumbnailUrl: courses.thumbnailUrl,
            totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`.as("total_lessons"),
            completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`.as("completed_lessons"),
          })
          .from(courses)
          .leftJoin(modules, eq(modules.courseId, courses.id))
          .leftJoin(lessons, eq(lessons.moduleId, modules.id))
          .leftJoin(
            lessonProgress,
            and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, user.id))
          )
          .where(isNull(courses.deletedAt))
          .groupBy(courses.id, courses.title, courses.description, courses.thumbnailUrl);
      } else {
        const courseIds = Array.from(permissions.courseIds);
        if (courseIds.length === 0) {
          userCourses = [];
        } else {
          userCourses = await db
            .select({
              id: courses.id,
              title: courses.title,
              description: courses.description,
              thumbnailUrl: courses.thumbnailUrl,
              totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`.as("total_lessons"),
              completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`.as("completed_lessons"),
            })
            .from(courses)
            .leftJoin(modules, eq(modules.courseId, courses.id))
            .leftJoin(lessons, eq(lessons.moduleId, modules.id))
            .leftJoin(
              lessonProgress,
              and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, user.id))
            )
            .where(and(isNull(courses.deletedAt), inArray(courses.id, courseIds)))
            .groupBy(courses.id, courses.title, courses.description, courses.thumbnailUrl);
        }
      }
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-bold">My Courses</h1>
          </div>
          <p className="text-zinc-400">
            Continue learning from your enrolled courses.
          </p>
        </header>

        {userCourses.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-zinc-600" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-300">No courses found</h2>
            <p className="text-zinc-500 mt-2 max-w-md mx-auto">
              You haven&apos;t enrolled in any courses yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={{
                  id: course.id,
                  title: course.title,
                  description: course.description,
                  thumbnailUrl: course.thumbnailUrl,
                  accessTier: isCoachOrAbove
                    ? "full"
                    : permissions?.getAccessTier(course.id) ?? "preview",
                }}
                progress={{
                  completedLessons: course.completedLessons ?? 0,
                  totalLessons: course.totalLessons ?? 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Failed to load courses:", error);
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorAlert
          variant="block"
          message="Unable to load your courses. Please try refreshing the page."
        />
      </div>
    );
  }
}
