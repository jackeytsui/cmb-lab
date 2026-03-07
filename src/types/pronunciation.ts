// ============================================================
// Pronunciation Assessment Types
// ============================================================
// Type definitions for Azure Speech pronunciation assessment results.
// Used by src/lib/pronunciation.ts and the practice grade route.

/**
 * Per-word (per-character for Chinese) pronunciation assessment result.
 * In Azure Speech for zh-CN/zh-HK, each Chinese character IS a separate "word".
 */
export interface PronunciationWordResult {
  word: string;
  accuracyScore: number;
  errorType:
    | "None"
    | "Mispronunciation"
    | "Omission"
    | "Insertion"
    | "UnexpectedBreak"
    | "MissingBreak"
    | "Monotone";
}

/**
 * Overall pronunciation assessment result returned from Azure Speech REST API.
 * Contains aggregate scores and per-word breakdowns.
 */
export interface PronunciationAssessmentResult {
  overallScore: number; // PronScore 0-100
  accuracyScore: number; // 0-100
  fluencyScore: number; // 0-100
  completenessScore: number; // 0-100
  prosodyScore?: number; // 0-100 (may not be available for all locales)
  words: PronunciationWordResult[];
  recognizedText: string;
}
