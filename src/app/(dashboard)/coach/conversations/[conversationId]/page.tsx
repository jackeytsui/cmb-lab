import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  conversations,
  conversationTurns,
  lessons,
  modules,
  courses,
  users,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ChevronLeft, User, Book, Clock, Calendar, MessageSquare } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ConversationTranscript, type TranscriptTurn } from "@/components/voice/ConversationTranscript";
import { ErrorAlert } from "@/components/ui/error-alert";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown duration";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Conversation detail page for coach review.
 *
 * Features:
 * - Student information
 * - Lesson context
 * - Conversation metadata (start time, duration)
 * - Full transcript using ConversationTranscript component
 *
 * Access Control:
 * - Requires minimum coach role
 */
export default async function ConversationDetailPage({ params }: PageProps) {
  const { conversationId } = await params;

  // Verify coach role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Fetch conversation with related data -- DB errors show ErrorAlert, missing shows notFound
  let conversationData;
  try {
    conversationData = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        lessonId: conversations.lessonId,
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
      .where(eq(conversations.id, conversationId))
      .limit(1);
  } catch (err) {
    console.error("Failed to load conversation:", err);
    return (
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/coach/conversations"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Conversations
        </Link>
        <ErrorAlert
          variant="block"
          message="Unable to load conversation details. Please try again."
        />
      </div>
    );
  }

  if (conversationData.length === 0) {
    notFound();
  }

  const conversation = conversationData[0];

  // Fetch turns -- graceful degradation: show metadata even if transcript fails
  let transcriptError = false;
  let turns: TranscriptTurn[] = [];
  try {
    const turnsData = await db
      .select({
        role: conversationTurns.role,
        content: conversationTurns.content,
        timestamp: conversationTurns.timestamp,
      })
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(asc(conversationTurns.timestamp));

    // Format turns for transcript component
    turns = turnsData.map((turn) => ({
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
    }));
  } catch (err) {
    console.error("Failed to load conversation transcript:", err);
    transcriptError = true;
  }

  const displayName = conversation.studentName || conversation.studentEmail;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/coach/conversations"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Conversations
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Conversation Review</h1>
          <p className="text-muted-foreground mt-2">
            Voice practice session transcript
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Info cards */}
          <div className="lg:col-span-1 space-y-6">
            {/* Student info */}
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="w-4 h-4 text-cyan-400" />
                  Student
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="font-semibold text-foreground">{displayName}</p>
                <p className="text-sm text-muted-foreground">{conversation.studentEmail}</p>
              </CardContent>
            </Card>

            {/* Lesson info */}
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Book className="w-4 h-4 text-cyan-400" />
                  Lesson Context
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Course</span>
                  <p className="text-foreground">{conversation.courseTitle}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Module</span>
                  <p className="text-foreground">{conversation.moduleTitle}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Lesson</span>
                  <p className="text-foreground font-medium">{conversation.lessonTitle}</p>
                </div>
              </CardContent>
            </Card>

            {/* Conversation metadata */}
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  Session Info
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {format(new Date(conversation.startedAt), "PPpp")}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Duration</span>
                  <p className="text-foreground font-medium">
                    {formatDuration(conversation.durationSeconds)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block">Status</span>
                  <p className={`font-medium ${conversation.endedAt ? "text-green-400" : "text-yellow-400"}`}>
                    {conversation.endedAt ? "Completed" : "In Progress"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Transcript */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-cyan-400" />
                  Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {transcriptError ? (
                  <ErrorAlert message="Unable to load conversation transcript." className="mb-4" />
                ) : turns.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No transcript available</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This conversation may have ended without any exchanges.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto">
                    <ConversationTranscript turns={turns} isLive={false} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
  );
}
