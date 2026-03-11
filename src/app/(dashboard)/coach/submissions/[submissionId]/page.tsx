import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { ChevronLeft, User, Book, MessageSquare, Mic, CheckCircle, Clock, Bot, Video } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";
import { CoachFeedbackForm } from "@/components/coach/CoachFeedbackForm";
import { CoachNotesPanel } from "@/components/coach/CoachNotesPanel";
import { db } from "@/db";
import {
  submissions,
  users,
  lessons,
  interactions,
  coachFeedback,
  coachNotes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface PageProps {
  params: Promise<{ submissionId: string }>;
}

// Type for submission detail
interface SubmissionDetail {
  submission: {
    id: string;
    type: "text" | "audio" | "video";
    response: string;
    audioData: string | null;
    videoUrl: string | null;
    score: number;
    aiFeedback: string;
    transcription: string | null;
    status: "pending_review" | "reviewed" | "archived";
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  student: {
    id: string;
    name: string | null;
    email: string;
  };
  lesson: {
    id: string;
    title: string;
    moduleId: string;
  };
  interaction: {
    id: string;
    prompt: string;
    expectedAnswer: string | null;
    type: "text" | "audio" | "video";
  };
  feedback: {
    id: string;
    loomUrl: string | null;
    feedbackText: string | null;
    createdAt: Date;
  } | null;
  notes: Array<{
    id: string;
    content: string;
    visibility: "internal" | "shared";
    createdAt: Date;
  }>;
}

/**
 * Query submission details directly from the database.
 * Returns a discriminated result to distinguish DB errors from genuinely missing submissions.
 */
async function getSubmission(
  submissionId: string,
  coachUserId: string
): Promise<{ data: SubmissionDetail | null; error: boolean }> {
  try {
    const submissionData = await db
      .select({
        id: submissions.id,
        type: submissions.type,
        response: submissions.response,
        audioData: submissions.audioData,
        videoUrl: submissions.videoUrl,
        score: submissions.score,
        aiFeedback: submissions.aiFeedback,
        transcription: submissions.transcription,
        status: submissions.status,
        reviewedAt: submissions.reviewedAt,
        createdAt: submissions.createdAt,
        updatedAt: submissions.updatedAt,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        lessonModuleId: lessons.moduleId,
        interactionId: interactions.id,
        interactionPrompt: interactions.prompt,
        interactionExpectedAnswer: interactions.expectedAnswer,
        interactionType: interactions.type,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(interactions, eq(submissions.interactionId, interactions.id))
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (submissionData.length === 0) return { data: null, error: false };

    const sub = submissionData[0];

    const feedbackData = await db
      .select()
      .from(coachFeedback)
      .where(eq(coachFeedback.submissionId, submissionId))
      .limit(1);

    const notesData = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.submissionId, submissionId),
          eq(coachNotes.coachId, coachUserId)
        )
      );

    return {
      data: {
        submission: {
          id: sub.id,
          type: sub.type as "text" | "audio" | "video",
          response: sub.response,
          audioData: sub.audioData,
          videoUrl: sub.videoUrl,
          score: sub.score,
          aiFeedback: sub.aiFeedback,
          transcription: sub.transcription,
          status: sub.status,
          reviewedAt: sub.reviewedAt,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt,
        },
        student: {
          id: sub.studentId,
          name: sub.studentName,
          email: sub.studentEmail,
        },
        lesson: {
          id: sub.lessonId,
          title: sub.lessonTitle,
          moduleId: sub.lessonModuleId,
        },
        interaction: {
          id: sub.interactionId,
          prompt: sub.interactionPrompt,
          expectedAnswer: sub.interactionExpectedAnswer,
          type: sub.interactionType as "text" | "audio" | "video",
        },
        feedback: feedbackData[0] || null,
        notes: notesData,
      },
      error: false,
    };
  } catch (error) {
    console.error("Error fetching submission:", error);
    return { data: null, error: true };
  }
}

/**
 * Get score color based on value
 */
function getScoreColor(score: number): string {
  if (score < 70) return "text-red-400";
  if (score <= 85) return "text-yellow-400";
  return "text-green-400";
}

/**
 * Get score background color based on value
 */
function getScoreBgColor(score: number): string {
  if (score < 70) return "bg-red-500/10 border-red-500/30";
  if (score <= 85) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-green-500/10 border-green-500/30";
}

/**
 * Format date to readable string
 */
function formatDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Submission detail page for coach review.
 * Displays full submission information with student context, AI grading, and audio playback.
 */
export default async function SubmissionDetailPage({ params }: PageProps) {
  const { submissionId } = await params;

  // Check coach role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get current user for notes panel and DB query
  const currentUser = await getCurrentUser();

  // Query submission directly from DB (replaces broken self-fetch pattern)
  const result = await getSubmission(submissionId, currentUser?.id ?? "");

  // DB error: show styled error with back link
  if (result.error) {
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
          message="Unable to load submission details. Please try again or go back to the dashboard."
        />
      </div>
    );
  }

  // Genuinely missing submission: show Next.js 404
  if (!result.data) {
    notFound();
  }

  const { submission, student, lesson, interaction, feedback } = result.data;
  const displayName = student.name || student.email.split("@")[0];
  const TypeIcon = submission.type === "video" ? Video : (submission.type === "audio" ? Mic : MessageSquare);

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

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Review Submission</h1>
          {submission.status === "reviewed" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium bg-green-600/20 text-green-400 border border-green-600/30 rounded-full">
              <CheckCircle className="w-4 h-4" />
              Reviewed
            </span>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Submission Details (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student info card */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-cyan-600/20 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{displayName}</h3>
                  <p className="text-sm text-muted-foreground">{student.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                Submitted {formatDate(submission.createdAt)}
              </div>
            </div>

            {/* Lesson and interaction context */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Book className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-foreground">Lesson Context</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Lesson</span>
                  <p className="text-foreground font-medium">{lesson.title}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Interaction Prompt</span>
                  <p className="text-foreground">{interaction.prompt}</p>
                </div>
                {interaction.expectedAnswer && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Expected Answer</span>
                    <p className="text-muted-foreground text-sm italic">{interaction.expectedAnswer}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Submission content */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <TypeIcon className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-foreground">
                  Student {submission.type === "audio" ? "Recording" : submission.type === "video" ? "Video" : "Response"}
                </h3>
                <span
                  className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                    submission.type === "audio"
                      ? "bg-purple-600/20 text-purple-400 border border-purple-600/30"
                      : submission.type === "video"
                      ? "bg-rose-600/20 text-rose-400 border border-rose-600/30"
                      : "bg-cyan-600/20 text-cyan-400 border border-cyan-600/30"
                  }`}
                >
                  {submission.type === "audio" ? "Audio" : submission.type === "video" ? "Video" : "Text"}
                </span>
              </div>

              {/* Media player or text content */}
              {submission.type === "video" && submission.videoUrl ? (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-border">
                    <video
                      controls
                      className="w-full h-full"
                      src={submission.videoUrl}
                    >
                      Your browser does not support the video element.
                    </video>
                  </div>
                </div>
              ) : submission.type === "audio" && submission.audioData ? (
                <div className="space-y-4">
                  <audio
                    controls
                    className="w-full"
                    src={`data:audio/webm;base64,${submission.audioData}`}
                  >
                    Your browser does not support the audio element.
                  </audio>
                  {submission.transcription && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                        Transcription
                      </span>
                      <p className="text-foreground italic">{submission.transcription}</p>
                    </div>
                  )}
                </div>
              ) : (submission.type === "audio" || submission.type === "video") && !submission.audioData && !submission.videoUrl ? (
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-muted-foreground">Media recording is unavailable</p>
                </div>
              ) : (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-foreground whitespace-pre-wrap">{submission.response}</p>
                </div>
              )}
            </div>

            {/* AI grading section */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-foreground">AI Grading</h3>
              </div>

              {/* Score display */}
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={`px-4 py-2 rounded-lg border ${getScoreBgColor(submission.score)}`}
                >
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Score</span>
                  <span className={`text-3xl font-bold ${getScoreColor(submission.score)}`}>
                    {submission.score}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        submission.score < 70
                          ? "bg-red-500"
                          : submission.score <= 85
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${submission.score}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* AI feedback */}
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                  AI Feedback
                </span>
                <p className="text-foreground">{submission.aiFeedback}</p>
              </div>
            </div>
          </div>

          {/* Right column - Coach Actions (1/3 width) */}
          <div className="lg:col-span-1 space-y-6">
            <CoachFeedbackForm
              submissionId={submission.id}
              existingFeedback={feedback ? {
                loomUrl: feedback.loomUrl,
                feedbackText: feedback.feedbackText,
              } : undefined}
            />
            <CoachNotesPanel
              submissionId={submission.id}
              studentId={student.id}
              currentUserId={currentUser?.id}
            />
          </div>
        </div>
      </div>
  );
}
