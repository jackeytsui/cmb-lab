"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Mic, CheckCircle, Clock, Video } from "lucide-react";

interface SubmissionCardProps {
  submission: {
    id: string;
    type: "text" | "audio" | "video";
    score: number;
    status: "pending_review" | "reviewed" | "archived";
    createdAt: string;
    studentName: string | null;
    studentEmail: string;
    lessonTitle: string;
    interactionPrompt: string;
  };
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/**
 * Get score color based on value
 * Red < 70, Yellow 70-85, Green > 85
 */
function getScoreColor(score: number): string {
  if (score < 70) return "text-red-400";
  if (score <= 85) return "text-yellow-400";
  return "text-green-400";
}

/**
 * SubmissionCard component - displays a single submission in the queue.
 * Shows student name, lesson title, submission type, AI score, and time since submission.
 */
export function SubmissionCard({ submission }: SubmissionCardProps) {
  const TypeIcon = submission.type === "video" ? Video : (submission.type === "audio" ? Mic : MessageSquare);
  const displayName = submission.studentName || submission.studentEmail.split("@")[0];

  return (
    <Link href={`/coach/submissions/${submission.id}`}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
        className="group"
      >
        <div data-testid="submission-card" className="bg-card border border-border rounded-lg p-4 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 h-full flex flex-col">
          {/* Top row: Student name + Type badge */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground truncate">
              {displayName}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                submission.type === "audio"
                  ? "bg-purple-600/20 text-purple-400 border border-purple-600/30"
                  : submission.type === "video"
                  ? "bg-rose-600/20 text-rose-400 border border-rose-600/30"
                  : "bg-cyan-600/20 text-cyan-400 border border-cyan-600/30"
              }`}
            >
              <TypeIcon className="w-3 h-3" />
              {submission.type === "audio" ? "Audio" : submission.type === "video" ? "Video" : "Text"}
            </span>
          </div>

          {/* Lesson title */}
          <h3 className="text-base font-semibold text-foreground group-hover:text-cyan-400 transition-colors line-clamp-1 mb-1">
            {submission.lessonTitle}
          </h3>

          {/* Interaction prompt preview */}
          <p className="text-sm text-muted-foreground line-clamp-2 flex-grow">
            {submission.interactionPrompt}
          </p>

          {/* Bottom row: Score + Status + Time */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            {/* AI Score */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">AI Score:</span>
              <span className={`text-sm font-semibold ${getScoreColor(submission.score)}`}>
                {submission.score}
              </span>
            </div>

            {/* Status badge + Time */}
            <div className="flex items-center gap-2">
              {submission.status === "reviewed" && (
                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  Reviewed
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(submission.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
