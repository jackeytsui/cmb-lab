// Type definitions for all CMB assignment types.

export type AssignmentLessonType =
  | "standard"
  | "challenge"
  | "listening_practice"
  | "vocal_hack"
  | "diary_challenge";

// ── Admin config (stored in lesson.assignmentConfig JSON) ──────────────────

export type ChallengeConfig = {
  sentenceCount: number; // 1–9
};

export type ListeningPracticeConfig = {
  audioBlobUrl: string;
  sentences: Array<{
    chinese: string;
    expectedPinyin: string; // normalized: no tones, all lowercase, no spaces
  }>;
};

export type VocalHackConfig = {
  sentences: Array<{
    muxPlaybackId: string;
    pinyin: string;
    chinese: string;
    english: string;
  }>;
};

export type DiaryConfig = Record<string, never>;

export type AssignmentConfig =
  | ChallengeConfig
  | ListeningPracticeConfig
  | VocalHackConfig
  | DiaryConfig;

// ── Student submission data (stored in lessonSubmissions.submissionData JSON) ─

export type ChallengeSubmissionData = {
  sentences: string[];
};

export type ListeningPracticeSubmissionData = {
  answers: Array<{
    index: number;
    studentPinyin: string;
    correct: boolean;
    givenUp: boolean;
  }>;
};

export type VocalHackSubmissionData = {
  recordings: Array<{
    index: number;
    blobUrl: string;
  }>;
};

export type DiarySubmissionData = {
  text: string;
  audioBlobUrl: string;
};

export type SubmissionData =
  | ChallengeSubmissionData
  | ListeningPracticeSubmissionData
  | VocalHackSubmissionData
  | DiarySubmissionData;

// ── Coach review data (stored in lessonReviews.reviewData JSON) ────────────

export type AssignmentReviewData = {
  comments: string[]; // per sentence (or single item for diary)
  loomUrl?: string;
  overallFeedback?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function isAssignmentType(lessonType: string): lessonType is Exclude<AssignmentLessonType, "standard"> {
  return (
    lessonType === "challenge" ||
    lessonType === "listening_practice" ||
    lessonType === "vocal_hack" ||
    lessonType === "diary_challenge"
  );
}

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentLessonType, string> = {
  standard: "Standard",
  challenge: "Challenge",
  listening_practice: "Listening Practice",
  vocal_hack: "Vocal Hack",
  diary_challenge: "Diary Challenge",
};

/** Normalize pinyin for comparison: lowercase, strip tone marks, collapse whitespace. */
export function normalizePinyin(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (tone marks)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
