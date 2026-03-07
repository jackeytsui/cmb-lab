import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  interactionAttempts,
  interactions,
  users,
  lessons,
  submissions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { AILogList } from "@/components/admin/AILogList";
import { ChevronRight, MessageSquare } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";

interface AILog {
  id: string;
  type: "text" | "audio" | "video";
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  interactionPrompt: string;
  studentResponse: string;
  transcription: string | null;
  score: number;
  aiFeedback: string;
  passed: boolean;
  createdAt: string;
  source: "attempt" | "submission";
}

/**
 * Admin AI Logs page - displays AI feedback/grading events.
 *
 * Features:
 * - View all AI grading events from interactionAttempts and submissions
 * - Filter by student, type (text/audio), date range
 * - Expandable rows to see full feedback
 *
 * Access Control:
 * - Requires admin role
 */
export default async function AdminAILogsPage() {
  // Verify user has admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  let initialLogs: AILog[] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    // Fetch initial logs - same logic as the API but direct DB query
    const [attemptsData, submissionsData] = await Promise.all([
      db
        .select({
          id: interactionAttempts.id,
          type: interactions.type,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          lessonTitle: lessons.title,
          interactionPrompt: interactions.prompt,
          studentResponse: interactionAttempts.response,
          score: interactionAttempts.score,
          aiFeedback: interactionAttempts.feedback,
          isCorrect: interactionAttempts.isCorrect,
          createdAt: interactionAttempts.createdAt,
        })
        .from(interactionAttempts)
        .innerJoin(
          interactions,
          eq(interactionAttempts.interactionId, interactions.id)
        )
        .innerJoin(users, eq(interactionAttempts.userId, users.id))
        .innerJoin(lessons, eq(interactions.lessonId, lessons.id)),
      db
        .select({
          id: submissions.id,
          type: submissions.type,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          lessonTitle: lessons.title,
          interactionPrompt: interactions.prompt,
          studentResponse: submissions.response,
          transcription: submissions.transcription,
          score: submissions.score,
          aiFeedback: submissions.aiFeedback,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .innerJoin(users, eq(submissions.userId, users.id))
        .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
        .innerJoin(interactions, eq(submissions.interactionId, interactions.id)),
    ]);

    // Transform and merge
    const logs: AILog[] = [];

    for (const attempt of attemptsData) {
      logs.push({
        id: attempt.id,
        type: attempt.type,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        studentEmail: attempt.studentEmail,
        lessonTitle: attempt.lessonTitle,
        interactionPrompt: attempt.interactionPrompt,
        studentResponse: attempt.studentResponse,
        transcription: null,
        score: attempt.score,
        aiFeedback: attempt.aiFeedback,
        passed: attempt.isCorrect,
        createdAt: attempt.createdAt.toISOString(),
        source: "attempt",
      });
    }

    for (const submission of submissionsData) {
      const passed = submission.score >= 80;
      logs.push({
        id: submission.id,
        type: submission.type,
        studentId: submission.studentId,
        studentName: submission.studentName,
        studentEmail: submission.studentEmail,
        lessonTitle: submission.lessonTitle,
        interactionPrompt: submission.interactionPrompt,
        studentResponse: submission.studentResponse,
        transcription: submission.transcription,
        score: submission.score,
        aiFeedback: submission.aiFeedback,
        passed,
        createdAt: submission.createdAt.toISOString(),
        source: "submission",
      });
    }

    // Sort by date DESC and take first 50
    logs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    initialLogs = logs.slice(0, 50);
    total = logs.length;
  } catch (err) {
    console.error("Failed to load AI feedback logs:", err);
    fetchError = "Failed to load AI feedback logs. Please try again later.";
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">AI Feedback Logs</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold">AI Feedback Logs</h1>
          </div>
          {!fetchError && (
            <p className="text-zinc-400">
              {total} total log{total === 1 ? "" : "s"}. View AI grading feedback
              given to students.
            </p>
          )}
        </header>

        {/* AI log list */}
        <section aria-label="AI Feedback Logs">
          {fetchError ? (
            <ErrorAlert message={fetchError} variant="block" />
          ) : (
            <AILogList initialLogs={initialLogs} initialTotal={total} />
          )}
        </section>
    </div>
  );
}
