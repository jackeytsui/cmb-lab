export type CoachingLanguage = "mandarin" | "cantonese";

export type CoachingSessionPresentation = {
  language: CoachingLanguage;
  languageLabel: "Mandarin" | "Cantonese";
  name: string;
};

const CANTONESE_SESSION_PATTERN = /\bcanto(?:nese)?\b/i;

export function getCoachingSessionPresentation(
  title: string,
): CoachingSessionPresentation {
  const language: CoachingLanguage = CANTONESE_SESSION_PATTERN.test(title)
    ? "cantonese"
    : "mandarin";

  if (language === "cantonese") {
    return { language, languageLabel: "Cantonese", name: "Canto Session" };
  }

  if (/\b(?:beginner|foundation)\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: Foundation" };
  }

  if (/\bintermediate\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: Intermediate" };
  }

  if (/\ball[ -]?levels?\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: All Levels" };
  }

  if (/\beurope(?:an)?(?:\s+timezone)?\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: EU Timezone" };
  }

  return { language, languageLabel: "Mandarin", name: "CMB: Group Coaching" };
}
