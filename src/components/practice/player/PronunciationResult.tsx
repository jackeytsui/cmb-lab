"use client";

import { motion } from "framer-motion";
import type { PronunciationAssessmentResult } from "@/types/pronunciation";

// ============================================================
// Score threshold constants
// ============================================================

const SCORE_GREEN = 80; // correct
const SCORE_YELLOW = 50; // close

// ============================================================
// Helpers
// ============================================================

/** Returns a Tailwind text color class based on pronunciation score */
function getScoreColor(score: number): string {
  if (score >= SCORE_GREEN) return "text-green-400";
  if (score >= SCORE_YELLOW) return "text-yellow-400";
  return "text-red-400";
}

/** Returns a Tailwind background color class based on pronunciation score */
function getScoreBgColor(score: number): string {
  if (score >= SCORE_GREEN) return "bg-green-400/10";
  if (score >= SCORE_YELLOW) return "bg-yellow-400/10";
  return "bg-red-400/10";
}

// ============================================================
// Props
// ============================================================

interface PronunciationResultProps {
  result: PronunciationAssessmentResult;
}

// ============================================================
// PronunciationResult — per-character tone accuracy highlighting
// ============================================================

export function PronunciationResult({ result }: PronunciationResultProps) {
  const subScores = [
    { label: "Accuracy", value: result.accuracyScore },
    { label: "Fluency", value: result.fluencyScore },
    { label: "Completeness", value: result.completenessScore },
    ...(result.prosodyScore !== undefined
      ? [{ label: "Prosody", value: result.prosodyScore }]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4 space-y-4"
    >
      {/* Overall score */}
      <div className="text-center">
        <p className={`text-4xl font-bold ${getScoreColor(result.overallScore)}`}>
          {result.overallScore}
        </p>
        <p className="text-sm text-zinc-500 mt-1">Overall Score</p>
      </div>

      {/* Per-character display */}
      {result.words.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {result.words.map((word, index) => (
            <div
              key={`${word.word}-${index}`}
              className={`flex flex-col items-center px-3 py-2 rounded-lg ${getScoreBgColor(word.accuracyScore)}`}
            >
              <span className={`text-2xl ${getScoreColor(word.accuracyScore)}`}>
                {word.word}
              </span>
              <span className="text-xs text-zinc-500 mt-0.5">
                {word.accuracyScore}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-scores grid */}
      <div
        className={`grid gap-3 ${
          subScores.length === 4 ? "grid-cols-4" : "grid-cols-3"
        }`}
      >
        {subScores.map((sub) => (
          <div
            key={sub.label}
            className="text-center p-2 rounded-lg bg-zinc-800/50"
          >
            <p className={`text-lg font-semibold ${getScoreColor(sub.value)}`}>
              {sub.value}
            </p>
            <p className="text-xs text-zinc-500">{sub.label}</p>
          </div>
        ))}
      </div>

      {/* Recognized text */}
      {result.recognizedText && (
        <p className="text-sm text-zinc-400 text-center">
          Heard: &ldquo;{result.recognizedText}&rdquo;
        </p>
      )}
    </motion.div>
  );
}
