"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, RotateCcw, BookOpen, Home } from "lucide-react";

interface SmartCTAsProps {
  type: "lesson" | "practice";
  score: number;
  nextLesson?: { id: string; title: string } | null;
  nextAction?: { label: string; href: string };
  courseId?: string;
  practiceSetId?: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

export function SmartCTAs({
  type,
  score,
  nextLesson,
  nextAction,
  courseId,
  onDismiss,
  onRetry,
}: SmartCTAsProps) {
  return (
    <motion.div className="flex flex-col items-center gap-3">
      {/* Primary CTA */}
      {type === "lesson" && nextLesson ? (
        <Link
          href={`/lessons/${nextLesson.id}`}
          onClick={onDismiss}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Next Lesson
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : type === "lesson" && !nextLesson && courseId ? (
        <Link
          href={`/courses/${courseId}`}
          onClick={onDismiss}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Back to Course
          <BookOpen className="h-4 w-4" />
        </Link>
      ) : type === "practice" && nextAction ? (
        <Link
          href={nextAction.href}
          onClick={onDismiss}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          {nextAction.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : type === "practice" ? (
        <button
          onClick={onDismiss}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Done
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}

      {/* Secondary CTA: Try Again for practice with low scores */}
      {type === "practice" && score < 95 && onRetry && (
        <button
          onClick={() => {
            onRetry();
            onDismiss();
          }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Try Again
        </button>
      )}

      {/* Tertiary CTA: Dashboard link (always shown) */}
      <Link
        href="/dashboard"
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-zinc-400 hover:text-white text-sm underline-offset-4 hover:underline transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        Dashboard
      </Link>
    </motion.div>
  );
}
