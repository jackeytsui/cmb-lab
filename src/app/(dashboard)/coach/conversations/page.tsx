import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { hasMinimumRole } from "@/lib/auth";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { db } from "@/db";
import { conversations, lessons, modules, courses, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ChevronLeft, MessageSquare, Clock, User, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { z } from "zod";

import { ErrorAlert } from "@/components/ui/error-alert";

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Coach Conversations page - displays assigned student conversations for review.
 *
 * Features:
 * - List of assigned student voice conversations
 * - Shows student name, lesson, date, and duration
 * - Click to view full transcript detail
 *
 * Access Control:
 * - Requires minimum coach role
 * - Students are redirected to dashboard
 */
export default async function CoachConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  // Verify coach role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/home");
  }

  const access = await getStaffStudentAccessContext();
  if (access.status !== "authorized") {
    redirect("/home");
  }

  // Get search params
  const params = await searchParams;
  const rawStudentIdFilter = params.studentId;
  const parsedStudentIdFilter = z.string().uuid().safeParse(rawStudentIdFilter);
  if (rawStudentIdFilter && !parsedStudentIdFilter.success) {
    redirect("/coach/conversations");
  }
  const studentIdFilter = parsedStudentIdFilter.success
    ? parsedStudentIdFilter.data
    : undefined;
  const conversationWhere =
    access.actor.role === "admin"
      ? studentIdFilter
        ? eq(conversations.userId, studentIdFilter)
        : undefined
      : studentIdFilter
        ? and(
            eq(conversations.userId, studentIdFilter),
            eq(users.assignedCoachId, access.actor.id),
          )
        : eq(users.assignedCoachId, access.actor.id);
  const studentWhere =
    access.actor.role === "admin"
      ? undefined
      : eq(users.assignedCoachId, access.actor.id);

  // Wrap DB queries in try/catch -- auth stays outside
  let conversationList;
  let studentsResult;

  try {
    // Fetch accessible conversations with student and lesson info.
    conversationList = await db
      .select({
        id: conversations.id,
        lessonId: conversations.lessonId,
        userId: conversations.userId,
        startedAt: conversations.startedAt,
        endedAt: conversations.endedAt,
        durationSeconds: conversations.durationSeconds,
        createdAt: conversations.createdAt,
        lessonTitle: lessons.title,
        moduleTitle: modules.title,
        courseTitle: courses.title,
        studentName: users.name,
        studentEmail: users.email,
      })
      .from(conversations)
      .innerJoin(lessons, eq(conversations.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .innerJoin(users, eq(conversations.userId, users.id))
      .where(conversationWhere)
      .orderBy(desc(conversations.startedAt))
      .limit(100);

    // Get unique students for filter dropdown
    studentsResult = await db
      .selectDistinct({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(conversations)
      .innerJoin(users, eq(conversations.userId, users.id))
      .where(studentWhere)
      .orderBy(users.name);
  } catch (err) {
    console.error("Failed to load conversations:", err);
    return (
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/coach"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Coach Dashboard
        </Link>
        <ErrorAlert
          variant="block"
          message="Unable to load conversations. Please try refreshing the page."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/coach"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Coach Dashboard
        </Link>

        {/* Page heading */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Conversations
            </h1>
            <p className="text-muted-foreground">
              Review voice practice sessions from your students
            </p>
          </div>
        </div>

        {/* Student filter */}
        {studentsResult.length > 0 && (
          <div className="mb-6">
            <label htmlFor="student-filter" className="block text-sm font-medium text-muted-foreground mb-2">
              Filter by Student
            </label>
            <form>
              <select
                id="student-filter"
                name="studentId"
                defaultValue={studentIdFilter || ""}
                className="w-full max-w-xs bg-muted border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All Students</option>
                {studentsResult.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name || student.email}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="ml-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
              >
                Apply filter
              </button>
            </form>
          </div>
        )}

        {/* Conversations list */}
        {conversationList.length === 0 ? (
          <EmptyState hasFilter={!!studentIdFilter} />
        ) : (
          <div className="space-y-4 max-w-4xl">
            {conversationList.map((conversation) => (
              <Card key={conversation.id} className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold text-foreground">
                        {conversation.lessonTitle}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {conversation.courseTitle} / {conversation.moduleTitle}
                      </p>
                    </div>
                    <Link
                      href={`/coach/conversations/${conversation.id}`}
                      className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-sm"
                    >
                      View Details
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span className="font-medium text-foreground">
                        {conversation.studentName || conversation.studentEmail}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {formatDistanceToNow(new Date(conversation.startedAt), { addSuffix: true })}
                    </div>
                    {conversation.durationSeconds && (
                      <span className="text-muted-foreground">
                        Duration: {formatDuration(conversation.durationSeconds)}
                      </span>
                    )}
                    {!conversation.endedAt && (
                      <span className="text-yellow-500">In progress</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}

/**
 * Empty state when no conversations found
 */
function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
        <MessageSquare className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        {hasFilter ? "No conversations from this student" : "No conversations yet"}
      </h2>
      <p className="text-muted-foreground mt-2">
        {hasFilter
          ? "This student hasn't had any voice practice sessions yet."
          : "Students haven't had any voice practice sessions yet."}
      </p>
      {hasFilter && (
        <Link
          href="/coach/conversations"
          className="inline-flex items-center justify-center mt-6 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
        >
          View All Conversations
        </Link>
      )}
    </div>
  );
}
