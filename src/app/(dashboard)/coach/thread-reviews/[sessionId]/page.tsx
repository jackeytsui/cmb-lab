import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { videoThreadSessions, videoThreadResponses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import {
  ChevronLeft,
  MessageSquare,
  Mic,
  Video,
  MousePointerClick,
  Clock,
  CheckCircle,
  BarChart3,
} from "lucide-react";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * Get a status badge for the session.
 */
function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        classes: "bg-green-500/10 text-green-400 border-green-500/30",
      };
    case "in_progress":
      return {
        label: "In Progress",
        classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
      };
    case "abandoned":
      return {
        label: "Abandoned",
        classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
      };
    default:
      return {
        label: status,
        classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
      };
  }
}

/**
 * Get response type badge styling.
 */
function getResponseTypeBadge(type: string) {
  switch (type) {
    case "text":
      return {
        label: "Text",
        classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
        Icon: MessageSquare,
      };
    case "audio":
      return {
        label: "Audio",
        classes: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        Icon: Mic,
      };
    case "video":
      return {
        label: "Video",
        classes: "bg-rose-500/10 text-rose-400 border-rose-500/30",
        Icon: Video,
      };
    case "button":
      return {
        label: "Button",
        classes: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        Icon: MousePointerClick,
      };
    default:
      return {
        label: type,
        classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
        Icon: MessageSquare,
      };
  }
}

/**
 * Format a date to a readable string.
 */
function formatDate(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format duration between two dates.
 */
function formatDuration(start: Date, end: Date | null): string {
  if (!end) return "In Progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Determine the Mux playback ID for a media response.
 * Prefers metadata.muxPlaybackId over content field.
 */
function getPlaybackId(
  content: string | null,
  metadata: Record<string, unknown> | null
): string | null {
  // Prefer metadata.muxPlaybackId
  if (metadata && typeof metadata === "object" && "muxPlaybackId" in metadata) {
    const muxId = metadata.muxPlaybackId;
    if (typeof muxId === "string" && muxId.trim()) return muxId;
  }
  // Fallback to content if it looks like a playback ID (no spaces, not empty)
  if (content && content.trim() && !/\s/.test(content.trim())) {
    return content.trim();
  }
  return null;
}

/**
 * Session detail page for coach thread review.
 * Shows a chronological timeline of student responses for a given session.
 */
export default async function ThreadReviewSessionPage({ params }: PageProps) {
  const { sessionId } = await params;

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const session = await db.query.videoThreadSessions.findFirst({
    where: eq(videoThreadSessions.id, sessionId),
    with: {
      student: true,
      thread: true,
      responses: {
        orderBy: [asc(videoThreadResponses.createdAt)],
        with: { step: true },
      },
    },
  });

  if (!session) {
    notFound();
  }

  const studentName =
    session.student?.name ||
    session.student?.email?.split("@")[0] ||
    "Unknown Student";
  const threadTitle = session.thread?.title || "Untitled Thread";
  const badge = getStatusBadge(session.status);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back navigation */}
      <Link
        href="/coach/thread-reviews"
        className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to Thread Reviews
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">{threadTitle}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-zinc-400">{studentName}</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${badge.classes}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Response Timeline */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Response Timeline
        </h2>

        {session.responses.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-8 text-center">
            <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">
              No responses recorded for this session yet.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-5 top-2 bottom-2 w-px bg-zinc-800" />

            <div className="space-y-6">
              {session.responses.map((response, index) => {
                const typeBadge = getResponseTypeBadge(response.responseType);
                const TypeIcon = typeBadge.Icon;
                const metadata = response.metadata as Record<
                  string,
                  unknown
                > | null;
                const playbackId = getPlaybackId(response.content, metadata);

                return (
                  <div key={response.id} className="relative pl-12">
                    {/* Timeline dot */}
                    <div className="absolute left-3 top-3 w-4 h-4 rounded-full bg-zinc-800 border-2 border-zinc-600 z-10" />

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
                      {/* Step header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-zinc-300">
                            {response.step?.promptText || `Step ${index + 1}`}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${typeBadge.classes}`}
                          >
                            <TypeIcon className="w-3 h-3" />
                            {typeBadge.label}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {formatDate(response.createdAt)}
                        </span>
                      </div>

                      {/* Response content */}
                      {(response.responseType === "text" ||
                        response.responseType === "button") && (
                        <div className="bg-zinc-800/50 rounded-lg p-4">
                          <p className="text-zinc-200 whitespace-pre-wrap">
                            {response.content || "(No content)"}
                          </p>
                        </div>
                      )}

                      {response.responseType === "audio" && (
                        <div className="max-w-md">
                          {playbackId ? (
                            <VideoPlayer playbackId={playbackId} />
                          ) : (
                            <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
                              <Mic className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                              <p className="text-zinc-500 text-sm">
                                Audio recording unavailable
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {response.responseType === "video" && (
                        <div className="max-w-2xl aspect-video">
                          {playbackId ? (
                            <VideoPlayer playbackId={playbackId} />
                          ) : (
                            <div className="bg-zinc-800/50 rounded-lg p-4 text-center h-full flex items-center justify-center">
                              <div>
                                <Video className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                                <p className="text-zinc-500 text-sm">
                                  Video recording unavailable
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Session Summary Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-teal-400" />
          <h3 className="font-semibold text-white">Session Summary</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">
              Total Responses
            </span>
            <p className="text-xl font-bold text-white">
              {session.responses.length}
            </p>
          </div>
          <div>
            <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">
              Duration
            </span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <p className="text-xl font-bold text-white">
                {formatDuration(session.startedAt, session.completedAt)}
              </p>
            </div>
          </div>
          <div>
            <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">
              Status
            </span>
            <div className="flex items-center gap-2">
              {session.status === "completed" ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <Clock className="w-4 h-4 text-yellow-400" />
              )}
              <p className="text-xl font-bold text-white">
                {session.status === "completed"
                  ? "Completed"
                  : session.status === "in_progress"
                  ? "In Progress"
                  : "Abandoned"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
