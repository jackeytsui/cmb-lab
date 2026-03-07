import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { FeedbackCard } from "@/components/student/FeedbackCard";

import { ErrorAlert } from "@/components/ui/error-alert";
import { db } from "@/db";
import {
  submissions,
  users,
  lessons,
  coachFeedback,
  coachNotes,
} from "@/db/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";

interface FeedbackItem {
  submissionId: string;
  lessonId: string;
  lessonTitle: string;
  reviewedAt: string | null;
  coachName: string;
  loomUrl: string | null;
  feedbackText: string | null;
  sharedNotes: Array<{ content: string; createdAt: string }>;
  submissionType: "text" | "audio" | "video";
  score: number;
}

/**
 * Query feedback directly from the database.
 * Replaces the previous self-fetch pattern which didn't forward auth cookies.
 */
async function getFeedback(
  userId: string
): Promise<{ data: FeedbackItem[]; error: string | null }> {
  try {
    // Get current user from database
    const currentUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });
    if (!currentUser) return { data: [], error: null };

    // Fetch reviewed submissions with coach feedback
    const reviewedSubmissions = await db
      .select({
        submissionId: submissions.id,
        submissionType: submissions.type,
        score: submissions.score,
        reviewedAt: submissions.reviewedAt,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        feedbackId: coachFeedback.id,
        loomUrl: coachFeedback.loomUrl,
        feedbackText: coachFeedback.feedbackText,
        coachId: coachFeedback.coachId,
      })
      .from(submissions)
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(coachFeedback, eq(submissions.id, coachFeedback.submissionId))
      .where(
        and(
          eq(submissions.userId, currentUser.id),
          eq(submissions.status, "reviewed"),
          isNotNull(submissions.reviewedAt)
        )
      )
      .orderBy(desc(submissions.reviewedAt));

    // Get coach names and shared notes for each submission
    const feedbackWithDetails = await Promise.all(
      reviewedSubmissions.map(async (sub) => {
        const coach = await db.query.users.findFirst({
          where: eq(users.id, sub.coachId),
          columns: { name: true, email: true },
        });

        const sharedNotesData = await db
          .select({
            content: coachNotes.content,
            createdAt: coachNotes.createdAt,
          })
          .from(coachNotes)
          .where(
            and(
              eq(coachNotes.submissionId, sub.submissionId),
              eq(coachNotes.visibility, "shared")
            )
          )
          .orderBy(desc(coachNotes.createdAt));

        return {
          submissionId: sub.submissionId,
          lessonId: sub.lessonId,
          lessonTitle: sub.lessonTitle,
          reviewedAt: sub.reviewedAt?.toISOString() || null,
          coachName: coach?.name || coach?.email?.split("@")[0] || "Coach",
          loomUrl: sub.loomUrl,
          feedbackText: sub.feedbackText,
          sharedNotes: sharedNotesData.map((note) => ({
            content: note.content,
            createdAt: note.createdAt.toISOString(),
          })),
          submissionType: sub.submissionType,
          score: sub.score,
        };
      })
    );

    return { data: feedbackWithDetails, error: null };
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return {
      data: [],
      error: "Unable to load your feedback. Please try refreshing the page.",
    };
  }
}

/**
 * My Feedback page - shows students their coach feedback.
 * Displays Loom videos, text feedback, and shared notes.
 */
export default async function MyFeedbackPage() {
  // Verify authenticated
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { data: feedback, error } = await getFeedback(userId);

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Link>

        {/* Page subtitle */}
        <div className="mb-8">
          <p className="text-zinc-400">
            Personalized feedback from your coaches
          </p>
        </div>

        {/* Feedback list, error, or empty state */}
        {error ? (
          <ErrorAlert variant="block" message={error} />
        ) : feedback.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6 max-w-3xl">
            {feedback.map((item) => (
              <FeedbackCard key={item.submissionId} feedback={item} />
            ))}
          </div>
        )}
      </div>
  );
}

/**
 * Empty state when student has no feedback yet
 */
function EmptyState() {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <MessageSquare className="w-8 h-8 text-zinc-600" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-300">
        No coach feedback yet
      </h2>
      <p className="text-zinc-500 mt-2">
        Complete lessons to receive personalized feedback from your coach!
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center mt-6 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
      >
        Start Learning
      </Link>
    </div>
  );
}
