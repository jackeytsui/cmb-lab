import type { FinishReason } from "ai";

const INCOMPLETE_ANSWER_PATTERNS = [
  /\bi (?:do not|don't) know\b/i,
  /\bi (?:cannot|can't|could not|couldn't|am unable to) (?:answer|confirm|find|locate|verify|access|see|determine)\b/i,
  /\bi (?:do not|don't) have (?:enough|that|the) (?:information|data|context|access)\b/i,
  /\bi(?:'m| am) not (?:able|sure)\b/i,
  /\bnot enough (?:information|data|context)\b/i,
  /\bplease (?:contact|email|reach out to) (?:the |our )?(?:support |human )?team\b/i,
];

/**
 * Last-resort safety net for model responses that did not use the handoff
 * tool. It intentionally prefers an extra support task over a missed student.
 */
export function answerNeedsAutomaticHandoff(
  text: string,
  finishReason: FinishReason,
): boolean {
  const answer = text.trim();
  if (!answer) return true;
  if (["length", "content-filter", "error", "other", "unknown"].includes(finishReason)) {
    return true;
  }
  return INCOMPLETE_ANSWER_PATTERNS.some((pattern) => pattern.test(answer));
}

