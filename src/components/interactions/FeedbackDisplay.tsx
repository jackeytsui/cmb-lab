"use client";

import { CheckCircle, XCircle, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { GradingFeedback } from "@/lib/grading";

interface FeedbackDisplayProps {
  feedback: GradingFeedback;
}

/**
 * Displays grading feedback with visual distinction for correct/incorrect answers.
 * Shows score badge, corrections list, and hints for incorrect answers.
 * Animates in/out with Framer Motion.
 */
export function FeedbackDisplay({ feedback }: FeedbackDisplayProps) {
  return (
    <motion.div
      data-testid="feedback"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-4 rounded-lg ${
        feedback.isCorrect
          ? "bg-green-500/20 border border-green-500/50"
          : "bg-red-500/20 border border-red-500/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {feedback.isCorrect ? (
          <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-6 w-6 text-red-500 shrink-0" />
        )}
        <div className="space-y-2 flex-1">
          {/* Main feedback message */}
          <p className="text-white font-medium"><PhoneticText>{feedback.feedback}</PhoneticText></p>

          {/* Score badge */}
          <div className="flex items-center gap-2">
            <span
              className={`text-sm px-2 py-0.5 rounded ${
                feedback.isCorrect
                  ? "bg-green-500/30 text-green-300"
                  : "bg-red-500/30 text-red-300"
              }`}
            >
              Score: {feedback.score}/100
            </span>
          </div>

          {/* Corrections list */}
          {feedback.corrections && feedback.corrections.length > 0 && (
            <div className="text-sm text-zinc-300 mt-2">
              <p className="font-medium text-zinc-200">Corrections:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                {feedback.corrections.map((correction, index) => (
                  <li key={index}><PhoneticText>{correction}</PhoneticText></li>
                ))}
              </ul>
            </div>
          )}

          {/* Hints for incorrect answers */}
          {!feedback.isCorrect &&
            feedback.hints &&
            feedback.hints.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-yellow-400 mt-2 p-2 bg-yellow-500/10 rounded">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Hint:</p>
                  <p><PhoneticText>{feedback.hints[0]}</PhoneticText></p>
                </div>
              </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}
