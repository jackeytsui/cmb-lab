"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, MessageSquare, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ConversationTranscript, type TranscriptTurn } from "@/components/voice/ConversationTranscript";


/**
 * Conversation list item from API
 */
interface ConversationItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

/**
 * Conversation with turns for expanded view
 */
interface ConversationWithTurns extends ConversationItem {
  turns?: TranscriptTurn[];
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
 * Conversation card component
 */
function ConversationCard({ conversation }: { conversation: ConversationWithTurns }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>(conversation.turns || []);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  /**
   * Load turns when expanded
   */
  const handleToggleExpand = async () => {
    // If expanding and there was a previous error, reset for retry
    if (!isExpanded && transcriptError) {
      setTranscriptError(null);
      setTurns([]);
    }

    if (!isExpanded && turns.length === 0) {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/conversations/${conversation.id}`);
        if (!response.ok) {
          setTranscriptError("Failed to load transcript.");
          setIsLoading(false);
          setIsExpanded(true);
          return;
        }
        const data = await response.json();
        const formattedTurns: TranscriptTurn[] = data.turns.map((turn: {
          role: "user" | "assistant";
          content: string;
          timestamp: number;
        }) => ({
          role: turn.role,
          content: turn.content,
          timestamp: turn.timestamp,
        }));
        setTurns(formattedTurns);
      } catch (error) {
        console.error("Failed to load conversation turns:", error);
        setTranscriptError("Failed to load transcript. Click to retry.");
        setTurns([]);
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="cursor-pointer" onClick={handleToggleExpand}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-white">
              {conversation.lessonTitle}
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              {conversation.courseTitle} / {conversation.moduleTitle}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" className="text-zinc-400">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDistanceToNow(new Date(conversation.startedAt), { addSuffix: true })}
          </div>
          {conversation.durationSeconds && (
            <span>Duration: {formatDuration(conversation.durationSeconds)}</span>
          )}
          {!conversation.endedAt && (
            <span className="text-yellow-500">In progress</span>
          )}
        </div>

        {/* Expanded transcript */}
        {isExpanded && (
          <div className="mt-4">
            {isLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
                <p className="text-sm text-zinc-500 mt-2">Loading transcript...</p>
              </div>
            ) : transcriptError ? (
              <div className="text-center py-4">
                <p className="text-sm text-red-400">{transcriptError}</p>
                <button
                  className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                    handleToggleExpand();
                  }}
                >
                  Click to retry
                </button>
              </div>
            ) : turns.length > 0 ? (
              <ConversationTranscript turns={turns} isLive={false} />
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                No transcript available
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when student has no conversations
 */
function EmptyState() {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <MessageSquare className="w-8 h-8 text-zinc-600" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-300">
        No conversations yet
      </h2>
      <p className="text-zinc-500 mt-2">
        Practice speaking with the AI tutor in your lessons to see your conversation history here.
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

/**
 * My Conversations page - shows student's conversation history.
 *
 * Features:
 * - List of past voice conversations
 * - Click to expand and view transcript
 * - Shows lesson context, date, and duration
 */
export default function MyConversationsPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      const data = await response.json();
      setConversations(data.conversations || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setError("Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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
            Review your voice practice sessions with the AI tutor
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4 max-w-3xl">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6"
              >
                <Skeleton className="h-5 w-1/2 bg-zinc-800" />
                <Skeleton className="h-4 w-1/3 mt-2 bg-zinc-800" />
                <Skeleton className="h-4 w-24 mt-4 bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorAlert
            variant="block"
            message={error}
            onRetry={() => {
              setError(null);
              setIsLoading(true);
              fetchConversations();
            }}
          />
        ) : conversations.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 max-w-3xl">
            {conversations.map((conversation) => (
              <ConversationCard key={conversation.id} conversation={conversation} />
            ))}
          </div>
        )}
      </div>
  );
}
