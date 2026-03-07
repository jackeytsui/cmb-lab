import type {
  MultipleChoiceDefinition,
  FillInBlankDefinition,
  MatchingDefinition,
  OrderingDefinition,
} from "@/types/exercises";
import type { PronunciationAssessmentResult } from "@/types/pronunciation";

// ============================================================
// GradeResult Type
// ============================================================

export interface GradeResult {
  isCorrect: boolean;
  score: number; // 0-100
  feedback: string;
  explanation?: string;
  pronunciationDetails?: PronunciationAssessmentResult; // Azure pronunciation scoring
}

// ============================================================
// gradeMultipleChoice
// ============================================================

/**
 * Grade a multiple choice exercise by comparing the selected option ID
 * against the correct option ID in the definition.
 *
 * @param selectedOptionId - The ID of the option the student selected
 * @param definition - The multiple choice exercise definition
 * @returns GradeResult with score 0 or 100
 */
export function gradeMultipleChoice(
  selectedOptionId: string,
  definition: MultipleChoiceDefinition
): GradeResult {
  const isCorrect = selectedOptionId === definition.correctOptionId;

  let feedback: string;
  if (isCorrect) {
    feedback = "Correct!";
  } else {
    const correctOption = definition.options.find(
      (opt) => opt.id === definition.correctOptionId
    );
    feedback = `Incorrect. The correct answer is: ${correctOption?.text ?? "unknown"}`;
  }

  return {
    isCorrect,
    score: isCorrect ? 100 : 0,
    feedback,
    explanation: definition.explanation,
  };
}

// ============================================================
// gradeFillInBlank
// ============================================================

/**
 * Normalize a string for comparison: trim whitespace and lowercase.
 * Safe for Chinese characters (toLowerCase is a no-op for CJK).
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Grade a fill-in-the-blank exercise by comparing each student answer
 * against the correct answer and acceptable answers for each blank.
 *
 * @param answers - Array of student answers, one per blank (in order)
 * @param definition - The fill-in-blank exercise definition
 * @returns GradeResult with proportional score
 */
export function gradeFillInBlank(
  answers: string[],
  definition: FillInBlankDefinition
): GradeResult {
  const totalBlanks = definition.blanks.length;
  let correctCount = 0;

  for (let i = 0; i < totalBlanks; i++) {
    const blank = definition.blanks[i];
    const studentAnswer = normalize(answers[i] ?? "");

    // Check against correctAnswer
    if (studentAnswer === normalize(blank.correctAnswer)) {
      correctCount++;
      continue;
    }

    // Check against acceptableAnswers
    if (blank.acceptableAnswers) {
      const accepted = blank.acceptableAnswers.some(
        (acceptable) => normalize(acceptable) === studentAnswer
      );
      if (accepted) {
        correctCount++;
      }
    }
  }

  const score = Math.round((correctCount / totalBlanks) * 100);
  const isCorrect = score === 100;

  const feedback = isCorrect
    ? "All blanks correct!"
    : `${correctCount}/${totalBlanks} blanks correct.`;

  return {
    isCorrect,
    score,
    feedback,
    explanation: definition.explanation,
  };
}

// ============================================================
// gradeMatching
// ============================================================

/**
 * Grade a matching exercise by checking if each user pair connects
 * the left and right sides of the same definition pair.
 *
 * The matching model: each definition pair has an `id`. In the UI,
 * the left column shows items identified by pair.id (left side),
 * and the right column shows items also identified by pair.id (right side).
 * A correct match means leftId === rightId (same pair connected).
 *
 * @param userPairs - Array of {leftId, rightId} representing student matches
 * @param definition - The matching exercise definition
 * @returns GradeResult with proportional score
 */
export function gradeMatching(
  userPairs: { leftId: string; rightId: string }[],
  definition: MatchingDefinition
): GradeResult {
  let correctCount = 0;

  for (const pair of userPairs) {
    if (pair.leftId === pair.rightId) {
      correctCount++;
    }
  }

  const total = definition.pairs.length;
  const score = Math.round((correctCount / total) * 100);
  const isCorrect = score === 100;

  const feedback = isCorrect
    ? "All pairs matched correctly!"
    : `${correctCount}/${total} pairs matched correctly.`;

  return {
    isCorrect,
    score,
    feedback,
    explanation: definition.explanation,
  };
}

// ============================================================
// gradeOrdering
// ============================================================

/**
 * Grade an ordering exercise by checking if each item is in its
 * correct position based on the definition.
 *
 * @param orderedItemIds - Array of item IDs in the student's chosen order
 * @param definition - The ordering exercise definition
 * @returns GradeResult with proportional score
 */
export function gradeOrdering(
  orderedItemIds: string[],
  definition: OrderingDefinition
): GradeResult {
  let correctCount = 0;
  const total = definition.items.length;

  for (let i = 0; i < orderedItemIds.length; i++) {
    const itemId = orderedItemIds[i];
    const item = definition.items.find((it) => it.id === itemId);

    if (item && item.correctPosition === i) {
      correctCount++;
    }
  }

  const score = Math.round((correctCount / total) * 100);
  const isCorrect = score === 100;

  const feedback = isCorrect
    ? "All items in correct order!"
    : `${correctCount}/${total} items in correct position.`;

  return {
    isCorrect,
    score,
    feedback,
    explanation: definition.explanation,
  };
}
