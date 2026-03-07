import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { StudentProgressView } from "@/components/admin/StudentProgressView";
import { GhlProfileSection } from "@/components/ghl/GhlProfileSection";
import { StudentTagsSection } from "./StudentTagsSection";
import { StudentAccessAttribution } from "@/components/admin/StudentAccessAttribution";
import { StudentPortalAccessControls } from "@/components/admin/StudentPortalAccessControls";
import { StudentProfileEditor } from "@/components/admin/StudentProfileEditor";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
  ChevronRight,
  ArrowLeft,
  User,
  BookOpen,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  MessageSquare,
  ClipboardList,
  Key,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ studentId: string }>;
}

function isPast(date: Date) {
  return date.getTime() < new Date().getTime();
}

// --- Activity Timeline types ---

interface ActivityEvent {
  type:
    | "lesson_completed"
    | "lesson_accessed"
    | "submission_created"
    | "conversation_started"
    | "practice_completed";
  title: string;
  timestamp: string; // ISO
  lessonTitle?: string;
  score?: number;
}

/**
 * Fetch recent activity events for a student from lesson progress,
 * submissions, conversations, and practice attempts.
 */
async function getActivityTimeline(
  studentId: string
): Promise<ActivityEvent[]> {
  const { db } = await import("@/db");
  const {
    lessonProgress,
    lessons,
    submissions,
    conversations,
    practiceAttempts,
    practiceSets,
  } = await import("@/db/schema");
  const { eq, desc } = await import("drizzle-orm");

  const [progressEvents, submissionEvents, conversationEvents, practiceEvents] =
    await Promise.all([
      // Lesson progress events (completed + accessed)
      db
        .select({
          lessonId: lessonProgress.lessonId,
          completedAt: lessonProgress.completedAt,
          lastAccessedAt: lessonProgress.lastAccessedAt,
          lessonTitle: lessons.title,
        })
        .from(lessonProgress)
        .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
        .where(eq(lessonProgress.userId, studentId)),

      // Submissions
      db
        .select({
          id: submissions.id,
          type: submissions.type,
          status: submissions.status,
          createdAt: submissions.createdAt,
          lessonId: submissions.lessonId,
          lessonTitle: lessons.title,
        })
        .from(submissions)
        .innerJoin(lessons, eq(lessons.id, submissions.lessonId))
        .where(eq(submissions.userId, studentId)),

      // AI Conversations
      db
        .select({
          id: conversations.id,
          lessonId: conversations.lessonId,
          createdAt: conversations.createdAt,
          lessonTitle: lessons.title,
        })
        .from(conversations)
        .innerJoin(lessons, eq(lessons.id, conversations.lessonId))
        .where(eq(conversations.userId, studentId)),

      // Practice Attempts
      db
        .select({
          id: practiceAttempts.id,
          score: practiceAttempts.score,
          completedAt: practiceAttempts.completedAt,
          practiceSetTitle: practiceSets.title,
        })
        .from(practiceAttempts)
        .innerJoin(
          practiceSets,
          eq(practiceSets.id, practiceAttempts.practiceSetId)
        )
        .where(eq(practiceAttempts.userId, studentId))
        .orderBy(desc(practiceAttempts.completedAt))
        .limit(20),
    ]);

  const events: ActivityEvent[] = [];

  // Build events from lesson progress
  for (const row of progressEvents) {
    if (row.completedAt) {
      events.push({
        type: "lesson_completed",
        title: `Completed: ${row.lessonTitle}`,
        timestamp: row.completedAt.toISOString(),
        lessonTitle: row.lessonTitle,
      });
    }
    if (row.lastAccessedAt) {
      const accessedTs = row.lastAccessedAt.toISOString();
      const completedTs = row.completedAt?.toISOString();
      if (accessedTs !== completedTs) {
        events.push({
          type: "lesson_accessed",
          title: `Accessed: ${row.lessonTitle}`,
          timestamp: accessedTs,
          lessonTitle: row.lessonTitle,
        });
      }
    }
  }

  // Build events from submissions
  for (const row of submissionEvents) {
    events.push({
      type: "submission_created",
      title: `Submitted ${row.type} response: ${row.lessonTitle}`,
      timestamp: row.createdAt.toISOString(),
      lessonTitle: row.lessonTitle,
    });
  }

  // Build events from conversations
  for (const row of conversationEvents) {
    events.push({
      type: "conversation_started",
      title: `Started AI conversation: ${row.lessonTitle}`,
      timestamp: row.createdAt.toISOString(),
      lessonTitle: row.lessonTitle,
    });
  }

  // Build events from practice attempts
  for (const row of practiceEvents) {
    if (row.completedAt) {
      events.push({
        type: "practice_completed",
        title: `Completed Quiz: ${row.practiceSetTitle} (Score: ${row.score ?? 0}%)`,
        timestamp: row.completedAt.toISOString(),
        score: row.score ?? 0,
      });
    }
  }

  // Sort by timestamp descending, limit to 50
  events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return events.slice(0, 50);
}

/**
 * Admin Student Detail page - shows individual student info, progress,
 * and activity timeline.
 */
export default async function AdminStudentDetailPage({ params }: PageProps) {
  // Verify user has coach+ role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { studentId } = await params;

  // Dynamic imports for main logic
  const { db } = await import("@/db");
  const { users, courseAccess, lessonProgress } = await import(
    "@/db/schema"
  );
  const { eq, sql, max } = await import("drizzle-orm");

  // Level 1: Fetch student (critical - show error page if fails)
  let student;
  try {
    student = await db.query.users.findFirst({
      where: eq(users.id, studentId),
    });
  } catch {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Users
        </Link>
        <ErrorAlert
          message="Failed to load student details. Please try again."
          variant="block"
        />
      </div>
    );
  }

  if (!student) {
    notFound();
  }

  const displayName = student.name || student.email.split("@")[0];
  const memberSince = format(new Date(student.createdAt), "MMMM d, yyyy");

  // Level 2: Fetch progress data (non-critical - student info card still renders)
  let stats = {
    coursesEnrolled: 0,
    lessonsCompleted: 0,
    lastActive: null as Date | null,
  };
  let activityTimeline: ActivityEvent[] = [];
  let courses: {
    id: string;
    title: string;
    progress: {
      lessonsTotal: number;
      lessonsCompleted: number;
      percentComplete: number;
    };
    modules: {
      id: string;
      title: string;
      lessons: {
        id: string;
        title: string;
        videoWatchedPercent: number;
        interactionsCompleted: number;
        interactionsTotal: number;
        completedAt: string | null;
      }[];
    }[];
  }[] = [];
  let progressError: string | null = null;
  let portalAccessRevoked = false;
  let portalAccessStatus: "active" | "paused" | "expired" = "active";
  let courseEndDate: Date | null = null;
  let courseEndDateLabel: string | null = null;
  let portalAccessReason: string | null = null;
  let courseEndDateIso: string | null = null;

  try {
    // Fetch summary stats and activity timeline in parallel
    const [
      coursesEnrolledResult,
      lessonsCompletedResult,
      lastActiveResult,
      timeline,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(courseAccess)
        .where(eq(courseAccess.userId, studentId)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(lessonProgress)
        .where(
          sql`${lessonProgress.userId} = ${studentId} AND ${lessonProgress.completedAt} IS NOT NULL`
        ),
      db
        .select({ lastActive: max(lessonProgress.lastAccessedAt) })
        .from(lessonProgress)
        .where(eq(lessonProgress.userId, studentId)),
      getActivityTimeline(studentId),
    ]);

    stats = {
      coursesEnrolled: Number(coursesEnrolledResult[0]?.count || 0),
      lessonsCompleted: Number(lessonsCompletedResult[0]?.count || 0),
      lastActive: lastActiveResult[0]?.lastActive || null,
    };
    activityTimeline = timeline;

    // Fetch detailed progress
    const {
      courseAccess: ca,
      courses: coursesTable,
      modules,
      lessons,
      interactions,
    } = await import("@/db/schema");
    const { asc } = await import("drizzle-orm");

    const studentAccessData = await db
      .select({ courseId: ca.courseId })
      .from(ca)
      .where(eq(ca.userId, studentId));

    const courseIds = studentAccessData.map((a) => a.courseId);

    if (courseIds.length > 0) {
      const coursesData = await db
        .select({
          courseId: coursesTable.id,
          courseTitle: coursesTable.title,
          moduleId: modules.id,
          moduleTitle: modules.title,
          moduleSortOrder: modules.sortOrder,
          lessonId: lessons.id,
          lessonTitle: lessons.title,
          lessonSortOrder: lessons.sortOrder,
        })
        .from(coursesTable)
        .innerJoin(modules, eq(modules.courseId, coursesTable.id))
        .innerJoin(lessons, eq(lessons.moduleId, modules.id))
        .where(sql`${coursesTable.id} IN ${courseIds}`)
        .orderBy(
          asc(coursesTable.title),
          asc(modules.sortOrder),
          asc(lessons.sortOrder)
        );

      const progressData = await db
        .select({
          lessonId: lessonProgress.lessonId,
          videoWatchedPercent: lessonProgress.videoWatchedPercent,
          interactionsCompleted: lessonProgress.interactionsCompleted,
          interactionsTotal: lessonProgress.interactionsTotal,
          completedAt: lessonProgress.completedAt,
        })
        .from(lessonProgress)
        .where(eq(lessonProgress.userId, studentId));

      const progressMap = new Map(
        progressData.map((p) => [
          p.lessonId,
          {
            videoWatchedPercent: p.videoWatchedPercent,
            interactionsCompleted: p.interactionsCompleted,
            interactionsTotal: p.interactionsTotal,
            completedAt: p.completedAt?.toISOString() || null,
          },
        ])
      );

      const interactionCounts = await db
        .select({
          lessonId: interactions.lessonId,
          count: sql<number>`COUNT(*)`,
        })
        .from(interactions)
        .groupBy(interactions.lessonId);

      const interactionCountMap = new Map(
        interactionCounts.map((i) => [i.lessonId, Number(i.count)])
      );

      const courseMap = new Map<string, (typeof courses)[0]>();

      for (const row of coursesData) {
        if (!courseMap.has(row.courseId)) {
          courseMap.set(row.courseId, {
            id: row.courseId,
            title: row.courseTitle,
            progress: {
              lessonsTotal: 0,
              lessonsCompleted: 0,
              percentComplete: 0,
            },
            modules: [],
          });
        }
        const course = courseMap.get(row.courseId)!;

        let courseModule = course.modules.find((m) => m.id === row.moduleId);
        if (!courseModule) {
          courseModule = {
            id: row.moduleId,
            title: row.moduleTitle,
            lessons: [],
          };
          course.modules.push(courseModule);
        }

        const progress = progressMap.get(row.lessonId);
        const totalInteractions = interactionCountMap.get(row.lessonId) || 0;

        courseModule.lessons.push({
          id: row.lessonId,
          title: row.lessonTitle,
          videoWatchedPercent: progress?.videoWatchedPercent || 0,
          interactionsCompleted: progress?.interactionsCompleted || 0,
          interactionsTotal: totalInteractions,
          completedAt: progress?.completedAt || null,
        });

        course.progress.lessonsTotal++;
        if (progress?.completedAt) {
          course.progress.lessonsCompleted++;
        }
      }

      for (const course of courseMap.values()) {
        if (course.progress.lessonsTotal > 0) {
          course.progress.percentComplete = Math.round(
            (course.progress.lessonsCompleted /
              course.progress.lessonsTotal) *
              100
          );
        }
      }

      courses = Array.from(courseMap.values());
    }
  } catch (error) {
    console.error("Failed to load progress:", error);
    progressError =
      "Failed to load student progress data. Some sections may be incomplete.";
  }

  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(student.clerkId);
    const metadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
    portalAccessRevoked = metadata.cmbPortalAccessRevoked === true;
    if (
      metadata.cmbPortalAccessStatus === "active" ||
      metadata.cmbPortalAccessStatus === "paused" ||
      metadata.cmbPortalAccessStatus === "expired"
    ) {
      portalAccessStatus = metadata.cmbPortalAccessStatus;
    } else if (portalAccessRevoked) {
      portalAccessStatus = "paused";
    }
    if (typeof metadata.cmbPortalAccessRevokedReason === "string") {
      portalAccessReason = metadata.cmbPortalAccessRevokedReason;
    }
    if (typeof metadata.cmbCourseEndDate === "string") {
      const parsed = new Date(metadata.cmbCourseEndDate);
      if (!Number.isNaN(parsed.getTime())) {
        courseEndDate = parsed;
        courseEndDateIso = metadata.cmbCourseEndDate.slice(0, 10);
        courseEndDateLabel = format(parsed, "MMMM d, yyyy");
      }
    }
  } catch (error) {
    console.error("Failed to load Clerk metadata for student detail:", error);
  }

  const lastActiveText = stats.lastActive
    ? formatDistanceToNow(new Date(stats.lastActive), { addSuffix: true })
    : "Never";

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
        <Link href="/admin" className="hover:text-white transition-colors">
          Admin
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link
          href="/admin/users"
          className="hover:text-white transition-colors"
        >
          Users
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-white">{displayName}</span>
      </nav>

      {/* Back button */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Users
      </Link>

      {/* Student info card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-cyan-600/20 flex items-center justify-center shrink-0">
            <User className="w-8 h-8 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold mb-1">{displayName}</h1>
            <p className="text-zinc-400">{student.email}</p>
            <p className="text-sm text-zinc-500 mt-2">
              Member since {memberSince}
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-zinc-300">
                Portal access status:{" "}
                <span
                  className={
                    portalAccessStatus === "active"
                      ? "text-emerald-400"
                      : portalAccessStatus === "paused"
                        ? "text-amber-400"
                        : "text-red-400"
                  }
                >
                  {portalAccessStatus.charAt(0).toUpperCase() + portalAccessStatus.slice(1)}
                </span>
              </p>
              <p className="text-zinc-300">
                Course end date:{" "}
                <span className="text-zinc-100">{courseEndDateLabel ?? "Not set"}</span>
              </p>
              {courseEndDate ? (
                <p className="text-xs text-zinc-500">
                  {isPast(courseEndDate)
                    ? "Course end date has passed."
                    : "Access remains active until this date."}
                </p>
              ) : null}
              {portalAccessReason ? (
                <p className="text-xs text-zinc-500">Reason: {portalAccessReason}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Progress error banner */}
      {progressError && (
        <div className="mb-8">
          <ErrorAlert message={progressError} />
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={<BookOpen className="w-5 h-5 text-cyan-400" />}
          label="Courses Enrolled"
          value={stats.coursesEnrolled}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-400" />}
          label="Lessons Completed"
          value={stats.lessonsCompleted}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-yellow-400" />}
          label="Last Active"
          value={lastActiveText}
          isText
        />
      </div>

      {/* Tags section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Student Profile</h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <StudentProfileEditor
            studentId={studentId}
            initialName={student.name}
            initialEmail={student.email}
            initialRole={student.role}
          />
        </div>
      </section>

      {/* Tags section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Tags</h2>
        <StudentTagsSection studentId={studentId} />
      </section>

      {/* Access Attribution */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-cyan-400" />
          Portal Access Controls
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <StudentPortalAccessControls
            studentId={studentId}
            initialStatus={portalAccessStatus}
            initialCourseEndDate={courseEndDateIso}
          />
        </div>
      </section>

      {/* Access Attribution */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400" />
          Access Attribution
        </h2>
        <p className="mb-3 text-sm text-zinc-400">
          Access is grouped by role. Student grants cover learner tools, while Coach/Admin roles unlock management features.
        </p>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <StudentAccessAttribution studentId={studentId} />
        </div>
      </section>

      {/* Activity Timeline */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-semibold">Activity Timeline</h2>
        </div>
        <ActivityTimeline events={activityTimeline} />
      </section>

      {/* GHL CRM Profile */}
      <section className="mb-8">
        <GhlProfileSection studentId={studentId} />
      </section>

      {/* Course progress */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Course Progress</h2>
        <StudentProgressView courses={courses} studentId={studentId} />
      </section>
    </div>
  );
}

// --- Activity Timeline Component ---

const EVENT_CONFIG: Record<
  ActivityEvent["type"],
  { icon: typeof CheckCircle; color: string; bgColor: string }
> = {
  lesson_completed: {
    icon: CheckCircle,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
  },
  lesson_accessed: {
    icon: Eye,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
  },
  submission_created: {
    icon: FileText,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  conversation_started: {
    icon: MessageSquare,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
  practice_completed: {
    icon: ClipboardList,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
  },
};

function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-8 text-center">
        <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 font-medium">No activity yet</p>
        <p className="text-sm text-zinc-500 mt-1">
          Activity will appear here as the student progresses through lessons.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-700" />

        <div className="space-y-4">
          {events.map((event, index) => {
            const config = EVENT_CONFIG[event.type];
            const Icon = config.icon;
            const relativeTime = formatDistanceToNow(new Date(event.timestamp), {
              addSuffix: true,
            });

            return (
              <div
                key={`${event.type}-${event.timestamp}-${index}`}
                className="relative pl-10"
              >
                {/* Timeline dot */}
                <div
                  className={`absolute left-2 top-1 w-5 h-5 rounded-full ${config.bgColor} flex items-center justify-center`}
                >
                  <Icon className={`w-3 h-3 ${config.color}`} />
                </div>

                {/* Event content */}
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-zinc-200">{event.title}</p>
                  <time
                    className="text-xs text-zinc-500 whitespace-nowrap shrink-0"
                    dateTime={event.timestamp}
                    title={format(new Date(event.timestamp), "MMM d, yyyy h:mm a")}
                  >
                    {relativeTime}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Stat Card Component ---

function StatCard({
  icon,
  label,
  value,
  isText = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${isText ? "text-lg" : ""}`}>
        {value}
      </div>
    </div>
  );
}
