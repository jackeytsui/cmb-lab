import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { users, courses, modules, lessons, lessonProgress, certificates } from "@/db/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { CourseCard } from "@/components/course/CourseCard";

import { ErrorAlert } from "@/components/ui/error-alert";
import { getStudentAssignments, type ResolvedAssignment } from "@/lib/assignments";
import { PracticeSetCard } from "@/components/practice/assignments/PracticeSetCard";
import { getStudentVideoAssignments } from "@/lib/video-assignments";
import {
  type ResolvedVideoAssignment,
  COMPLETION_THRESHOLD,
} from "@/types/video";
import { AssignedVideoCard } from "@/components/video/AssignedVideoCard";
import { getStudentThreadAssignments, type ResolvedThreadAssignment } from "@/lib/thread-assignments";
import { AssignedThreadCard } from "@/components/video-thread/AssignedThreadCard";
import { ClipboardList, Video, GitBranch } from "lucide-react";
import { XPOverview } from "@/components/xp/XPOverview";
import { resolvePermissions } from "@/lib/permissions";
import { hasMinimumRole } from "@/lib/auth";
import { StudyTodayCard } from "@/components/dashboard/StudyTodayCard";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";

/**
 * Dashboard page - shows courses the authenticated user has access to.
 * Server component that queries database directly.
 */
export default async function DashboardPage() {
  // Get current user
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/sign-in");
  }

  // Get user details for greeting
  const user = await currentUser();
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || null;
  const displayName = user?.firstName || primaryEmail || "Student";

  try {
    // Look up internal user
    let dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true, role: true, email: true },
    });
    if (!dbUser) {
      const email = primaryEmail;

      if (!email) {
        redirect("/sign-in");
      }

      const role = resolveRoleFromEmail(email);
      await db
        .insert(users)
        .values({
          clerkId,
          email,
          name:
            [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
          imageUrl: user?.imageUrl ?? null,
          role,
        })
        .onConflictDoNothing({ target: users.clerkId });

      dbUser = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkId),
        columns: { id: true, role: true, email: true },
      });

      if (!dbUser) {
        redirect("/sign-in");
      }
    } else if (dbUser.email) {
      const role = resolveRoleFromEmail(dbUser.email);
      if (dbUser.role !== role) {
        await db.update(users).set({ role }).where(eq(users.id, dbUser.id));
        dbUser = { ...dbUser, role };
      }
    }

    if (dbUser.role === "student") {
      await ensureDefaultStudentRoleAssignment(dbUser.id);
      redirect("/dashboard/reader");
    }

    if (dbUser.role === "admin") {
      redirect("/admin/manage");
    }

    // Coaches see all courses
    const isCoachOrAbove = await hasMinimumRole("coach");

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
          and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, dbUser.id))
        )
        .where(isNull(courses.deletedAt))
        .groupBy(courses.id, courses.title, courses.description, courses.thumbnailUrl);
    } else {
      // Students: resolve permissions (union of roles + direct courseAccess)
      permissions = await resolvePermissions(dbUser.id);

      if (permissions.hasWildcardAccess) {
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
            and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, dbUser.id))
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
              and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, dbUser.id))
            )
            .where(and(isNull(courses.deletedAt), inArray(courses.id, courseIds)))
            .groupBy(courses.id, courses.title, courses.description, courses.thumbnailUrl);
        }
      }
    }
    const userCertificates = dbUser
      ? await db
          .select({
            courseId: certificates.courseId,
            verificationId: certificates.verificationId,
          })
          .from(certificates)
          .where(eq(certificates.userId, dbUser.id))
      : [];

    // Build map: courseId -> verificationId
    const certificateMap = new Map<string, string>(
      userCertificates.map((c) => [c.courseId, c.verificationId])
    );

    // Fetch practice assignments (non-blocking — failure won't break dashboard)
    let assignments: ResolvedAssignment[] = [];
    try {
      if (dbUser) {
        assignments = await getStudentAssignments(dbUser.id);
      }
    } catch (err) {
      console.error("Failed to load practice assignments:", err);
    }

    // Fetch video assignments (non-blocking)
    let videoAssignments: ResolvedVideoAssignment[] = [];
    try {
      if (dbUser) {
        videoAssignments = await getStudentVideoAssignments(dbUser.id);
      }
    } catch (err) {
      console.error("Failed to load video assignments:", err);
    }

    // Fetch thread assignments (non-blocking)
    let threadAssignments: ResolvedThreadAssignment[] = [];
    try {
      if (dbUser) {
        threadAssignments = await getStudentThreadAssignments(dbUser.id);
      }
    } catch (err) {
      console.error("Failed to load thread assignments:", err);
    }

    // Filter to pending only (< 80% completion), sort by due date soonest first
    const pendingVideoAssignments = videoAssignments
      .filter((a) => (a.completionPercent ?? 0) < COMPLETION_THRESHOLD)
      .sort((a, b) => {
        if (a.dueDate && b.dueDate)
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    const pendingVideoCount = pendingVideoAssignments.length;

    const pendingAssignments = assignments
      .filter((a) => a.status === "pending")
      .sort((a, b) => {
        if (a.dueDate && b.dueDate)
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    const pendingCount = pendingAssignments.length;

    // Filter thread assignments: pending only (not completed), sort by due date soonest first
    const pendingThreadAssignments = threadAssignments
      .filter((a) => a.completionStatus !== "completed")
      .sort((a, b) => {
        if (a.dueDate && b.dueDate)
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    const pendingThreadCount = pendingThreadAssignments.length;

    return (
      <div className="container mx-auto px-4 py-8">
        {/* Greeting */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold">Welcome back, {displayName}</h2>
          <p className="text-zinc-400 mt-2">Continue learning from your courses</p>
        </div>

        {/* XP & Activity Overview */}
        <div className="mb-8">
          <XPOverview />
        </div>

        <div className="mb-8">
          <StudyTodayCard />
        </div>

        {/* Practice Assignments (if any) */}
        {assignments.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-emerald-400" />
                Practice Assignments
                {pendingCount > 0 && (
                  <span className="ml-2 rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-xs text-emerald-300 border border-emerald-700">
                    {pendingCount} pending
                  </span>
                )}
              </h3>
              <Link
                href="/dashboard/practice"
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {pendingAssignments.slice(0, 3).map((a) => (
                <PracticeSetCard
                  key={a.assignmentId}
                  practiceSetId={a.practiceSetId}
                  title={a.practiceSetTitle}
                  description={a.practiceSetDescription}
                  dueDate={a.dueDate}
                  exerciseCount={0}
                />
              ))}
            </div>
          </div>
        )}

        {/* Video Assignments (if any) */}
        {videoAssignments.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-400" />
                Video Assignments
                {pendingVideoCount > 0 && (
                  <span className="ml-2 rounded-full bg-blue-900/50 px-2.5 py-0.5 text-xs text-blue-300 border border-blue-700">
                    {pendingVideoCount} pending
                  </span>
                )}
              </h3>
              <Link
                href="/dashboard/listening/history"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {pendingVideoAssignments.slice(0, 3).map((a) => (
                <AssignedVideoCard
                  key={a.assignmentId}
                  assignment={a}
                />
              ))}
            </div>
          </div>
        )}

        {/* Thread Assignments (if any) */}
        {threadAssignments.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-purple-400" />
                Thread Assignments
                {pendingThreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-purple-900/50 px-2.5 py-0.5 text-xs text-purple-300 border border-purple-700">
                    {pendingThreadCount} pending
                  </span>
                )}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {pendingThreadAssignments.slice(0, 3).map((a) => (
                <AssignedThreadCard
                  key={a.assignmentId}
                  assignment={a}
                />
              ))}
            </div>
          </div>
        )}

        {/* Course grid or empty state */}
        {userCourses.length === 0 ? (
          <EmptyState />
        ) : (
          <div data-testid="course-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                certificateVerificationId={certificateMap.get(course.id) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.includes("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Dashboard data failed to load:", error);
    return (
      <div className="container mx-auto px-4 py-8">
        {/* Greeting still renders (from Clerk, not DB) */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold">Welcome back, {displayName}</h2>
          <p className="text-zinc-400 mt-2">Continue learning from your courses</p>
        </div>

        <ErrorAlert
          variant="block"
          message="Unable to load your courses. Please try refreshing the page."
        />
      </div>
    );
  }
}

/**
 * Empty state when user has no courses
 */
function EmptyState() {
  return (
    <div className="text-center py-16">
      <svg
        className="w-16 h-16 text-zinc-600 mx-auto mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
      <h2 className="text-xl font-semibold text-zinc-300">No courses yet</h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        You don&apos;t have access to any courses yet. Contact your administrator or
        instructor to get started.
      </p>
    </div>
  );
}
