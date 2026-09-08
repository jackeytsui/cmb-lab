export type CoachingLanguage = "mandarin" | "cantonese";

export type CoachingSessionPresentation = {
  language: CoachingLanguage;
  languageLabel: "Mandarin" | "Cantonese";
  name: string;
};

export type CoachingEventDetails = {
  repeatLabel: string | null;
  summary: string;
};

const CANTONESE_SESSION_PATTERN = /\bcanto(?:nese)?\b/i;

export function getCoachingEventDetails(
  description: string,
): CoachingEventDetails {
  const repeatLabel =
    description.match(/Repeats every ([^(\n.]+)/)?.[1]?.trim() ?? null;
  const summary = description
    .split("\n")
    .filter(
      (line) =>
        !/^Sign up here:/i.test(line) &&
        !/https:\/\/forms\.gle\//i.test(line) &&
        !line.startsWith("Repeats every") &&
        !line.startsWith("Cancelled on "),
    )
    .join("\n")
    .trim();

  return { repeatLabel, summary };
}

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

  if (/\badvanced\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: Advanced" };
  }

  if (/\ball[ -]?levels?\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: All Levels" };
  }

  if (/\beurope(?:an)?(?:\s+timezone)?\b/i.test(title)) {
    return { language, languageLabel: "Mandarin", name: "CMB: EU Timezone" };
  }

  return { language, languageLabel: "Mandarin", name: "CMB: Group Coaching" };
}
