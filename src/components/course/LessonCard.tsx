"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, Play, Check, ClipboardList } from "lucide-react";

interface AssociatedQuiz {
  assignmentId: string;
  practiceSetId: string;
  title: string;
  score?: number | null;
}

interface LessonCardProps {
  lesson: {
    id: string;
    title: string;
    description: string | null;
    durationSeconds: number | null;
  };
  isUnlocked: boolean;
  isCompleted: boolean;
  previousLessonTitle?: string;
  quizzes?: AssociatedQuiz[];
}

/**
 * Format duration in seconds to MM:SS format.
 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * LessonCard component displays a lesson with lock/unlock/complete states.
 */
export function LessonCard({
  lesson,
  isUnlocked,
  isCompleted,
  previousLessonTitle,
  quizzes = [],
}: LessonCardProps) {
  // Determine visual state
  const isLocked = !isUnlocked;

  // State-specific styles
  const getIconStyles = () => {
    if (isCompleted) {
      return {
        bgClass: "bg-green-500/20",
        iconClass: "text-green-500",
        Icon: Check,
      };
    }
    if (isUnlocked) {
      return {
        bgClass: "bg-cyan-500/20",
        iconClass: "text-cyan-500",
        Icon: Play,
      };
    }
    return {
      bgClass: "bg-zinc-700",
      iconClass: "text-zinc-500",
      Icon: Lock,
    };
  };

  const { bgClass, iconClass, Icon } = getIconStyles();

  return (
    <div className="space-y-3">
      {/* The Lesson Link Container */}
      <motion.div
        whileHover={isLocked ? {} : { scale: 1.005 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative ${isLocked ? "pointer-events-none" : "cursor-pointer"}`}
      >
        <Link 
          href={isLocked ? "#" : `/lessons/${lesson.id}`} 
          className={`flex items-center gap-4 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 transition-colors ${
            isLocked ? "opacity-50" : "hover:bg-zinc-800/50 hover:border-zinc-700"
          }`}
          data-testid={isLocked ? "lesson-card-locked" : isCompleted ? "lesson-card-completed" : "lesson-card"}
        >
          {/* Icon container */}
          <div
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full ${bgClass}`}
          >
            <Icon className={`w-5 h-5 ${iconClass}`} />
          </div>

          {/* Lesson info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate text-white">{lesson.title}</h4>
            {lesson.description && (
              <p className="text-sm text-zinc-400 truncate">{lesson.description}</p>
            )}
            {isLocked && previousLessonTitle && (
              <p className="text-xs text-zinc-500 mt-1">
                Complete &quot;{previousLessonTitle}&quot; first
              </p>
            )}
          </div>

          {/* Duration */}
          {lesson.durationSeconds && (
            <div className="flex-shrink-0 text-sm text-zinc-500">
              {formatDuration(lesson.durationSeconds)}
            </div>
          )}
        </Link>
      </motion.div>

      {/* Quizzes attached to this lesson */}
      {quizzes.length > 0 && (
        <div className="ml-8 space-y-2 pl-4 border-l border-zinc-800">
          {quizzes.map((quiz) => (
            isLocked ? (
              <div
                key={quiz.assignmentId}
                className="flex items-center gap-2 text-sm text-zinc-600 py-1 cursor-not-allowed opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{quiz.title}</span>
              </div>
            ) : (
              <Link
                key={quiz.assignmentId}
                href={`/practice/${quiz.practiceSetId}`}
                className="flex items-center justify-between gap-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors py-1 group pr-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ClipboardList className="w-4 h-4 text-zinc-500 group-hover:text-cyan-500 shrink-0" />
                  <span className="truncate">{quiz.title}</span>
                </div>
                {quiz.score !== null && quiz.score !== undefined && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      quiz.score >= 80
                        ? "bg-green-500/20 text-green-400"
                        : quiz.score >= 60
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {quiz.score}%
                  </span>
                )}
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}
