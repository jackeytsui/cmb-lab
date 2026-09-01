import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  users,
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { eq, and, isNull, inArray, asc } from "drizzle-orm";

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
import {
  ArrowRight,
  AudioLines,
  BookOpenText,
  ClipboardList,
  Gauge,
  GitBranch,
  Headphones,
  NotebookPen,
  Video,
  type LucideIcon,
} from "lucide-react";
import { XPOverview } from "@/components/xp/XPOverview";
import { resolvePermissions } from "@/lib/permissions";
import { StudyTodayCard } from "@/components/dashboard/StudyTodayCard";
import { DashboardLearningSection } from "@/components/dashboard/DashboardLearningSection";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";
import {
  applyFeatureTagOverrides,
  canViewCourseLibrary,
  getCourseLibraryCourseAccess,
  getUserFeatureTagOverrides,
} from "@/lib/tag-feature-access";
import { getCurrentUser as getEffectiveDbUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { DEFAULT_PLATFORM_ROLE } from "@/lib/platform-roles";
import {
  buildDashboardLearningCourses,
  type DashboardLearningCourse,
} from "@/lib/dashboard-learning";

type DashboardShortcut = {
  title: string;
  description: string;
  href: string;
  feature: string;
  icon: LucideIcon;
  accent: string;
};

type DashboardContentProps = {
  displayName: string;
  shortcuts: DashboardShortcut[];
  assignments: ResolvedAssignment[];
  pendingAssignments: ResolvedAssignment[];
  pendingCount: number;
  videoAssignments: ResolvedVideoAssignment[];
  pendingVideoAssignments: ResolvedVideoAssignment[];
  pendingVideoCount: number;
  threadAssignments: ResolvedThreadAssignment[];
  pendingThreadAssignments: ResolvedThreadAssignment[];
  pendingThreadCount: number;
  learningCourses: DashboardLearningCourse[];
  showCourseLibrary: boolean;
};

const DASHBOARD_SHORTCUTS: DashboardShortcut[] = [
  {
    title: "Course Library",
    description: "Continue your courses and see lesson progress.",
    href: "/course-library",
    feature: "course_library",
    icon: BookOpenText,
    accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    title: "Mandarin Accelerator",
    description: "Follow your guided practice plan and learning path.",
    href: "/accelerator",
    feature: "mandarin_accelerator",
    icon: Gauge,
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    title: "Audio Course",
    description: "Learn through audio-first lessons and exercises.",
    href: "/audio-courses",
    feature: "audio_courses",
    icon: AudioLines,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    title: "Mandarin AI Reader",
    description: "Read Mandarin with pinyin, translation, and audio tools.",
    href: "/reader/mandarin",
    feature: "dictionary_reader",
    icon: BookOpenText,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Cantonese AI Reader",
    description: "Read Cantonese with jyutping, translation, and audio tools.",
    href: "/reader/cantonese",
    feature: "dictionary_reader",
    icon: BookOpenText,
    accent: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    title: "YouTube Listening Lab",
    description: "Train your listening with guided video practice.",
    href: "/listening",
    feature: "listening_lab",
    icon: Headphones,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    title: "Notepad",
    description: "Keep your vocabulary, examples, and study notes together.",
    href: "/notepad",
    feature: "notepad",
    icon: NotebookPen,
    accent: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
];

function QuickAccess({ shortcuts }: { shortcuts: DashboardShortcut[] }) {
  if (shortcuts.length === 0) return null;

  return (
    <section aria-labelledby="quick-access-heading" className="space-y-3">
      <div>
        <h2 id="quick-access-heading" className="text-lg font-semibold text-foreground">
          Quick access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the learning areas included in your access are shown here.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex items-start gap-3">
              <span className={`rounded-lg p-2.5 ${shortcut.accent}`}>
                <shortcut.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-medium text-foreground">
                  {shortcut.title}
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {shortcut.description}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardContent({
  displayName,
  shortcuts,
  assignments,
  pendingAssignments,
  pendingCount,
  videoAssignments,
  pendingVideoAssignments,
  pendingVideoCount,
  threadAssignments,
  pendingThreadAssignments,
  pendingThreadCount,
  learningCourses,
  showCourseLibrary,
}: DashboardContentProps) {
  const primaryCourse = learningCourses[0];
  const primaryHref = primaryCourse?.nextLessonId
    ? `/course-library/${primaryCourse.id}/lessons/${primaryCourse.nextLessonId}`
    : primaryCourse
      ? `/course-library/${primaryCourse.id}`
      : shortcuts[0]?.href;

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#202a76] via-[#3545aa] to-[#4a9fe3] p-6 shadow-lg shadow-[#2e3a97]/10 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border-[40px] border-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#f2b705]/15 blur-2xl" />
        <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-[#f6d04d]">
          CMB Lab Home
        </p>
        <div className="relative mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Welcome back, {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Start with your next lesson, then use today&apos;s plan to keep your momentum going.
            </p>
          </div>
          {primaryHref && (
            <Link
              href={primaryHref}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#2e3a97] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {primaryCourse?.isStarted ? "Resume learning" : "Start learning"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {showCourseLibrary ? (
        <DashboardLearningSection courses={learningCourses} />
      ) : null}

      {assignments.length > 0 && (
        <section aria-labelledby="practice-assignments-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="practice-assignments-heading"
              className="flex items-center gap-2 text-lg font-semibold text-foreground"
            >
              <ClipboardList className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              Practice Assignments
              {pendingCount > 0 && (
                <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  {pendingCount} pending
                </span>
              )}
            </h2>
            <Link
              href="/practice"
              className="text-sm text-primary transition-opacity hover:opacity-80"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {pendingAssignments.slice(0, 3).map((assignment) => (
              <PracticeSetCard
                key={assignment.assignmentId}
                practiceSetId={assignment.practiceSetId}
                title={assignment.practiceSetTitle}
                description={assignment.practiceSetDescription}
                dueDate={assignment.dueDate}
                exerciseCount={0}
              />
            ))}
          </div>
        </section>
      )}

      {videoAssignments.length > 0 && (
        <section aria-labelledby="video-assignments-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="video-assignments-heading"
              className="flex items-center gap-2 text-lg font-semibold text-foreground"
            >
              <Video className="h-5 w-5 text-blue-500" aria-hidden="true" />
              Video Assignments
              {pendingVideoCount > 0 && (
                <span className="ml-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                  {pendingVideoCount} pending
                </span>
              )}
            </h2>
            <Link
              href="/listening/history"
              className="text-sm text-primary transition-opacity hover:opacity-80"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {pendingVideoAssignments.slice(0, 3).map((assignment) => (
              <AssignedVideoCard
                key={assignment.assignmentId}
                assignment={assignment}
              />
            ))}
          </div>
        </section>
      )}

      {threadAssignments.length > 0 && (
        <section aria-labelledby="thread-assignments-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="thread-assignments-heading"
              className="flex items-center gap-2 text-lg font-semibold text-foreground"
            >
              <GitBranch className="h-5 w-5 text-purple-500" aria-hidden="true" />
              Thread Assignments
              {pendingThreadCount > 0 && (
                <span className="ml-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs text-purple-600 dark:text-purple-400">
                  {pendingThreadCount} pending
                </span>
              )}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {pendingThreadAssignments.slice(0, 3).map((assignment) => (
              <AssignedThreadCard
                key={assignment.assignmentId}
                assignment={assignment}
              />
            ))}
          </div>
        </section>
      )}

      <StudyTodayCard />
      <XPOverview />
      <QuickAccess shortcuts={shortcuts} />
    </div>
  );
}

function DashboardLoadError({ displayName }: { displayName: string }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
        <p className="mt-2 text-muted-foreground">Your CMB Lab home could not load completely.</p>
      </div>
      <ErrorAlert
        variant="block"
        message="Unable to load your learning home. Please try refreshing the page."
      />
    </div>
  );
}

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
  let displayName = user?.firstName || primaryEmail || "Student";
  let pageData: DashboardContentProps | null = null;
  let loadFailed = false;

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

      await db
        .insert(users)
        .values({
          clerkId,
          email,
          name:
            [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
          imageUrl: user?.imageUrl ?? null,
          role: DEFAULT_PLATFORM_ROLE,
        })
        .onConflictDoNothing({ target: users.clerkId });

      dbUser = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkId),
        columns: { id: true, role: true, email: true },
      });

      if (!dbUser) {
        redirect("/sign-in");
      }
    }

    // Page navigation should follow the selected View As identity. The helper
    // only honors the impersonation cookie for a real administrator, so the
    // authorization boundary remains tied to the signed-in account while the
    // landing page and dashboard data mirror the selected user.
    const effectiveDbUser = await getEffectiveDbUser();
    if (effectiveDbUser) {
      displayName = effectiveDbUser.name || effectiveDbUser.email || displayName;
      dbUser = {
        id: effectiveDbUser.id,
        role: effectiveDbUser.role,
        email: effectiveDbUser.email,
      };
    }

    if (dbUser.role === "student") {
      await ensureDefaultStudentRoleAssignment(dbUser.id);
    }

    const [
      permissions,
      featureTagOverrides,
      showCourseLibrary,
      canSeeCourseLibraryCourse,
    ] = await Promise.all([
      resolvePermissions(dbUser.id),
      getUserFeatureTagOverrides(dbUser.id),
      canViewCourseLibrary(dbUser),
      getCourseLibraryCourseAccess(dbUser),
    ]);
    const enabledFeatures = applyFeatureTagOverrides(
      permissions.features,
      featureTagOverrides,
    );
    if (showCourseLibrary) enabledFeatures.add("course_library");
    else enabledFeatures.delete("course_library");
    const shortcuts = DASHBOARD_SHORTCUTS.filter((shortcut) =>
      enabledFeatures.has(shortcut.feature),
    );

    const learningCoursesPromise = showCourseLibrary
      ? db
        .select({
          courseId: courseLibraryCourses.id,
          courseTitle: courseLibraryCourses.title,
          courseSummary: courseLibraryCourses.summary,
          courseSortOrder: courseLibraryCourses.sortOrder,
          coverImageUrl: courseLibraryCourses.coverImageUrl,
          coverUpdatedAt: courseLibraryCourses.updatedAt,
          moduleId: courseLibraryModules.id,
          moduleTitle: courseLibraryModules.title,
          moduleSortOrder: courseLibraryModules.sortOrder,
          lessonId: courseLibraryLessons.id,
          lessonTitle: courseLibraryLessons.title,
          lessonSortOrder: courseLibraryLessons.sortOrder,
          progressId: courseLibraryLessonProgress.id,
          completedAt: courseLibraryLessonProgress.completedAt,
          progressUpdatedAt: courseLibraryLessonProgress.updatedAt,
        })
        .from(courseLibraryCourses)
        .leftJoin(
          courseLibraryModules,
          and(
            eq(courseLibraryModules.courseId, courseLibraryCourses.id),
            isNull(courseLibraryModules.deletedAt),
          ),
        )
        .leftJoin(
          courseLibraryLessons,
          and(
            eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
            isNull(courseLibraryLessons.deletedAt),
          ),
        )
        .leftJoin(
          courseLibraryLessonProgress,
          and(
            eq(
              courseLibraryLessonProgress.lessonId,
              courseLibraryLessons.id,
            ),
            eq(courseLibraryLessonProgress.userId, dbUser.id),
          ),
        )
        .where(
          and(
            isNull(courseLibraryCourses.deletedAt),
            inArray(
              courseLibraryCourses.status,
              visibleCourseStatuses(dbUser.role),
            ),
          ),
        )
        .orderBy(
          asc(courseLibraryCourses.sortOrder),
          asc(courseLibraryModules.sortOrder),
          asc(courseLibraryLessons.sortOrder),
        )
        .then((rows) =>
          buildDashboardLearningCourses(
            rows.filter((row) => canSeeCourseLibraryCourse(row.courseId)),
          ),
        )
      : Promise.resolve([] as DashboardLearningCourse[]);

    const assignmentsPromise = getStudentAssignments(dbUser.id).catch((error) => {
      console.error("Failed to load practice assignments:", error);
      return [] as ResolvedAssignment[];
    });
    const videoAssignmentsPromise = getStudentVideoAssignments(dbUser.id).catch(
      (error) => {
        console.error("Failed to load video assignments:", error);
        return [] as ResolvedVideoAssignment[];
      },
    );
    const threadAssignmentsPromise = getStudentThreadAssignments(dbUser.id).catch(
      (error) => {
        console.error("Failed to load thread assignments:", error);
        return [] as ResolvedThreadAssignment[];
      },
    );

    const [
      learningCourses,
      assignments,
      videoAssignments,
      threadAssignments,
    ] = await Promise.all([
      learningCoursesPromise,
      assignmentsPromise,
      videoAssignmentsPromise,
      threadAssignmentsPromise,
    ]);

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

    pageData = {
      displayName,
      shortcuts,
      assignments,
      pendingAssignments,
      pendingCount,
      videoAssignments,
      pendingVideoAssignments,
      pendingVideoCount,
      threadAssignments,
      pendingThreadAssignments,
      pendingThreadCount,
      learningCourses,
      showCourseLibrary,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Dashboard data failed to load:", error);
    loadFailed = true;
  }

  if (loadFailed || !pageData) return <DashboardLoadError displayName={displayName} />;
  return <DashboardContent {...pageData} />;
}
