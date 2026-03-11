import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { videoThreadSessions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";

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
 * Get status badge styling based on session status.
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
 * Thread Reviews list page for coaches.
 * Shows all student video thread sessions with status, student info, and thread title.
 */
export default async function ThreadReviewsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const sessions = await db.query.videoThreadSessions.findMany({
    with: {
      student: true,
      thread: true,
    },
    orderBy: [desc(videoThreadSessions.startedAt)],
  });

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back navigation */}
      <Link
        href="/coach"
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to Coach Dashboard
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Thread Reviews</h1>
        <p className="text-muted-foreground mt-2">
          Review student video thread submissions and their responses.
        </p>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">No thread submissions yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Student submissions will appear here once they start video threads.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const studentName =
              session.student?.name ||
              session.student?.email?.split("@")[0] ||
              "Unknown Student";
            const threadTitle = session.thread?.title || "Untitled Thread";
            const badge = getStatusBadge(session.status);

            return (
              <Link
                key={session.id}
                href={`/coach/thread-reviews/${session.id}`}
                className="block"
              >
                <div className="bg-card border border-border rounded-lg p-4 hover:border-teal-500/50 transition-colors group cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                        <PlayCircle className="w-5 h-5 text-teal-400" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-semibold text-foreground truncate">
                            {studentName}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {threadTitle}
                        </p>
                      </div>

                      {/* Dates */}
                      <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0">
                        <span>Started: {formatDate(session.startedAt)}</span>
                        <span>
                          Completed: {formatDate(session.completedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Chevron */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-teal-400 transition-colors ml-4 flex-shrink-0" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
