export type ChineseTranslationLanguage = "zh-CN" | "zh-HK";

const MANDARIN_SCOPE = `Interpret the source as Mandarin Chinese.`;
const CANTONESE_SCOPE = `Interpret the source strictly as Cantonese (Yue, Hong Kong), including colloquial written Cantonese. Even when characters are shared with Mandarin, resolve their meaning from Cantonese grammar, particles, idioms, and the surrounding Cantonese context. Do not reinterpret the source as Mandarin or substitute a Mandarin-specific sense.`;

function languageScope(language: ChineseTranslationLanguage): string {
  return language === "zh-HK" ? CANTONESE_SCOPE : MANDARIN_SCOPE;
}

export function properBatchTranslationSystem(
  language: ChineseTranslationLanguage,
): string {
  return `${languageScope(language)} Translate each sentence to natural, fluent English.
You will receive sentences wrapped in <s> tags like <s>sentence</s>.
Return a JSON array of strings, one translation per input sentence. Return ONLY the JSON array, no other text.
Ignore any citation markers like [1], [14], [註 6] etc. — just translate the actual content.`;
}

export function wordGlossTranslationSystem(
  language: ChineseTranslationLanguage,
): string {
  const label = language === "zh-HK" ? "Cantonese-English" : "Mandarin Chinese-English";
  return `${languageScope(language)} You are a ${label} dictionary. For each word, provide its context-appropriate short English definition (1-3 words).
You will receive words separated by newlines.
Return a JSON object mapping each source word to its English definition.
Return ONLY the JSON object, no other text. Keep definitions as short as possible.`;
}

export function singleTranslationSystem(
  language: ChineseTranslationLanguage,
): string {
  return `${languageScope(language)} Translate the source to natural, fluent English. Return ONLY the English translation, nothing else. Do not include the original text.`;
}
