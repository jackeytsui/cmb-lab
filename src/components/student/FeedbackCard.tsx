"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Video, MessageSquare, Mic, ExternalLink, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeedbackCardProps {
  feedback: {
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
  };
}

/**
 * Extract Loom video ID and return embed URL
 * Handles: share.loom.com/xxx, loom.com/share/xxx, www.loom.com/share/xxx
 */
function getLoomEmbedUrl(shareUrl: string): string | null {
  const match = shareUrl.match(
    /(?:share\.loom\.com\/|loom\.com\/share\/|www\.loom\.com\/share\/)([a-zA-Z0-9_-]+)/
  );
  return match ? `https://www.loom.com/embed/${match[1]}` : null;
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
 * Card displaying coach feedback for a student's submission.
 * Shows Loom video embed, text feedback, and shared notes.
 */
export function FeedbackCard({ feedback }: FeedbackCardProps) {
  const [showLoom, setShowLoom] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const loomEmbedUrl = feedback.loomUrl ? getLoomEmbedUrl(feedback.loomUrl) : null;
  const TypeIcon = feedback.submissionType === "video" ? Video : (feedback.submissionType === "audio" ? Mic : MessageSquare);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Card Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">
              {feedback.lessonTitle}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
              <span className="flex items-center gap-1">
                <TypeIcon className="w-4 h-4" />
                {feedback.submissionType === "video" ? "Video" : feedback.submissionType === "audio" ? "Audio" : "Text"}
              </span>
              {feedback.reviewedAt && (
                <span>
                  Reviewed{" "}
                  {formatDistanceToNow(new Date(feedback.reviewedAt), {
                    addSuffix: true,
                  })}
                </span>
              )}
              <span>by {feedback.coachName}</span>
            </div>
          </div>

          {/* Score badge */}
          <div className="flex items-center gap-2">
            <Trophy className={`w-5 h-5 ${getScoreColor(feedback.score)}`} />
            <span className={`text-xl font-bold ${getScoreColor(feedback.score)}`}>
              {feedback.score}
            </span>
          </div>
        </div>
      </div>

      {/* Loom Video Section */}
      {feedback.loomUrl && (
        <div className="border-b border-zinc-800">
          <button
            onClick={() => setShowLoom(!showLoom)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-cyan-400">
              <Video className="w-5 h-5" />
              <span className="font-medium">Video Feedback</span>
            </div>
            {showLoom ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          {showLoom && (
            <div className="px-4 pb-4">
              {loomEmbedUrl ? (
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={loomEmbedUrl}
                    className="w-full h-full"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; picture-in-picture"
                  />
                </div>
              ) : (
                <a
                  href={feedback.loomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Watch on Loom
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Text Feedback Section */}
      {feedback.feedbackText && (
        <div className="p-4 border-b border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">
            Written Feedback
          </h4>
          <p className="text-zinc-200 whitespace-pre-wrap">
            {feedback.feedbackText}
          </p>
        </div>
      )}

      {/* Shared Notes Section */}
      {feedback.sharedNotes.length > 0 && (
        <div className="border-b border-zinc-800">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-zinc-300">
              <MessageSquare className="w-4 h-4" />
              <span className="font-medium">
                Coach Notes ({feedback.sharedNotes.length})
              </span>
            </div>
            {showNotes ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          {showNotes && (
            <div className="px-4 pb-4 space-y-3">
              {feedback.sharedNotes.map((note, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
                >
                  <p className="text-zinc-200 whitespace-pre-wrap text-sm">
                    {note.content}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">
                    {formatDistanceToNow(new Date(note.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4">
        <Link href={`/lessons/${feedback.lessonId}`}>
          <Button variant="outline" size="sm" className="w-full">
            Replay Lesson
          </Button>
        </Link>
      </div>
    </div>
  );
}
