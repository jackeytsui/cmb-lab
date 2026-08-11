const PROMPT_INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|system|developer)\b.{0,30}\b(instruction|prompt|message|rule)s?\b/i,
  /\b(reveal|show|print|repeat|quote|leak|expose)\b.{0,45}\b(system|developer|hidden|internal)\b.{0,20}\b(prompt|instruction|message|rule)s?\b/i,
  /\b(system|developer)\s+(prompt|message|instruction)s?\b/i,
  /\bjailbreak\b/i,
];

/**
 * Detect requests whose purpose is to override or extract the assistant's
 * hidden instructions. These are not student-support issues and must never
 * create a human handover task.
 */
export function isPromptInjectionProbe(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
