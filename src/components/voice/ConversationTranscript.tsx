"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * A single turn in the conversation
 */
export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number; // Seconds from conversation start
}

interface ConversationTranscriptProps {
  /** Conversation turns to display */
  turns: TranscriptTurn[];
  /** Whether conversation is live (shows typing indicator) */
  isLive?: boolean;
}

/**
 * Format timestamp to MM:SS
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Typing indicator animation for AI responses
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <motion.div
        className="w-2 h-2 bg-zinc-400 rounded-full"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-2 h-2 bg-zinc-400 rounded-full"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div
        className="w-2 h-2 bg-zinc-400 rounded-full"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  );
}

/**
 * Display live or historical conversation transcript.
 *
 * Features:
 * - Scrollable container with max-height
 * - User messages on right (cyan), AI messages on left (gray)
 * - Role labels and timestamps
 * - Auto-scroll to bottom on new turns
 * - Framer Motion animations for smooth entry
 * - Typing indicator when waiting for AI response
 */
export function ConversationTranscript({
  turns,
  isLive = false,
}: ConversationTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Show typing indicator if live and last turn is user
  const showTypingIndicator =
    isLive && turns.length > 0 && turns[turns.length - 1].role === "user";

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 overflow-y-auto max-h-80 p-4 bg-zinc-800/30 rounded-lg"
    >
      {turns.length === 0 && !isLive && (
        <p className="text-zinc-500 text-sm text-center py-4">
          No conversation yet
        </p>
      )}

      {turns.length === 0 && isLive && (
        <p className="text-zinc-500 text-sm text-center py-4">
          Waiting for conversation to start...
        </p>
      )}

      <AnimatePresence initial={false}>
        {turns.map((turn, index) => (
          <motion.div
            key={`${turn.timestamp}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`flex flex-col ${
              turn.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Role label and timestamp */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs font-medium ${
                  turn.role === "user" ? "text-cyan-400" : "text-zinc-400"
                }`}
              >
                {turn.role === "user" ? "You" : "AI Tutor"}
              </span>
              <span className="text-xs text-zinc-600">
                {formatTimestamp(turn.timestamp)}
              </span>
            </div>

            {/* Message bubble */}
            <div
              className={`max-w-[85%] px-4 py-2 rounded-lg ${
                turn.role === "user"
                  ? "bg-cyan-600/20 text-cyan-100 border border-cyan-600/30"
                  : "bg-zinc-700/50 text-zinc-200 border border-zinc-600/30"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{turn.content}</p>
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        {showTypingIndicator && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-start"
          >
            <span className="text-xs font-medium text-zinc-400 mb-1">
              AI Tutor
            </span>
            <div className="px-4 py-2 rounded-lg bg-zinc-700/50 border border-zinc-600/30">
              <TypingIndicator />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
