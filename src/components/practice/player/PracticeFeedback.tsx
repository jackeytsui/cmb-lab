"use client";

import { CheckCircle, XCircle, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { GradeResult } from "@/lib/practice-grading";
import { PronunciationResult } from "./PronunciationResult";

// ============================================================
// Props
// ============================================================

interface PracticeFeedbackProps {
  result: GradeResult;
}

// ============================================================
// PracticeFeedback — per-exercise feedback display
// ============================================================

export function PracticeFeedback({ result }: PracticeFeedbackProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`feedback-${result.score}-${result.isCorrect}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25 }}
        className={`p-4 rounded-lg ${
          result.isCorrect
            ? "bg-green-500/20 border border-green-500/50"
            : "bg-red-500/20 border border-red-500/50"
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          {result.isCorrect ? (
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-6 w-6 text-red-500 shrink-0" />
          )}

          <div className="space-y-2 flex-1">
            {/* Feedback text */}
            <p className="text-white font-medium">{result.feedback}</p>

            {/* Score badge */}
            <div className="flex items-center gap-2">
              <span
                className={`text-sm px-2 py-0.5 rounded ${
                  result.isCorrect
                    ? "bg-green-500/30 text-green-300"
                    : "bg-red-500/30 text-red-300"
                }`}
              >
                Score: {result.score}/100
              </span>
            </div>

            {/* Explanation hint */}
            {result.explanation && (
              <div className="flex items-start gap-2 text-sm text-yellow-400 mt-2 p-2 bg-yellow-500/10 rounded">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Explanation:</p>
                  <p>{result.explanation}</p>
                </div>
              </div>
            )}

            {/* Pronunciation details for audio exercises */}
            {result.pronunciationDetails && (
              <PronunciationResult result={result.pronunciationDetails} />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
