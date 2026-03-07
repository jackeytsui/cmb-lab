import type { CuePoint } from "@/types/video";

/**
 * Language preference type for filtering interactions.
 * Matches the database enum: cantonese | mandarin | both
 */
export type LanguagePreference = "cantonese" | "mandarin" | "both";

/**
 * Extended cue point with language information for filtering.
 * Extends the base CuePoint with language metadata.
 */
export interface InteractionCuePoint extends CuePoint {
  /** Language this interaction is designed for */
  language: LanguagePreference;
  /** Type of interaction (text input, audio, etc.) */
  type?: "text" | "audio" | "video";
  /** Prompt to display to the user */
  prompt?: string;
  /** Expected answer for grading */
  expectedAnswer?: string;
  /** ID of the video prompt (for video interactions) */
  videoPromptId?: string;
}

/**
 * Filter interactions based on user's language preference.
 *
 * Filtering logic:
 * - "both": Show all interactions (no filtering)
 * - "cantonese": Show cantonese-only AND "both" interactions
 * - "mandarin": Show mandarin-only AND "both" interactions
 *
 * @param interactions - Array of items with language field
 * @param preference - User's language preference
 * @returns Filtered array of interactions
 *
 * @example
 * ```ts
 * const cuePoints = [
 *   { id: "1", language: "cantonese" },
 *   { id: "2", language: "mandarin" },
 *   { id: "3", language: "both" },
 * ];
 *
 * filterInteractionsByPreference(cuePoints, "cantonese");
 * // Returns: [{ id: "1", language: "cantonese" }, { id: "3", language: "both" }]
 *
 * filterInteractionsByPreference(cuePoints, "both");
 * // Returns: all 3 cue points
 * ```
 */
export function filterInteractionsByPreference<
  T extends { language: LanguagePreference },
>(interactions: T[], preference: LanguagePreference): T[] {
  // "both" preference means show everything
  if (preference === "both") {
    return interactions;
  }

  // Otherwise, show interactions matching user's language OR marked as "both"
  return interactions.filter(
    (interaction) =>
      interaction.language === preference || interaction.language === "both"
  );
}

/**
 * Filter cue points based on user's language preference.
 * Convenience wrapper for filterInteractionsByPreference with InteractionCuePoint type.
 *
 * @param cuePoints - Array of interaction cue points
 * @param preference - User's language preference
 * @returns Filtered array of cue points
 */
export function filterCuePointsByPreference(
  cuePoints: InteractionCuePoint[],
  preference: LanguagePreference
): InteractionCuePoint[] {
  return filterInteractionsByPreference(cuePoints, preference);
}

/**
 * Check if a single interaction should be shown for the given preference.
 * Useful for checking individual interactions without filtering an array.
 *
 * @param interactionLanguage - Language setting of the interaction
 * @param userPreference - User's language preference
 * @returns true if interaction should be shown
 *
 * @example
 * ```ts
 * shouldShowInteraction("cantonese", "both"); // true
 * shouldShowInteraction("cantonese", "mandarin"); // false
 * shouldShowInteraction("both", "mandarin"); // true
 * ```
 */
export function shouldShowInteraction(
  interactionLanguage: LanguagePreference,
  userPreference: LanguagePreference
): boolean {
  // "both" preference shows everything
  if (userPreference === "both") {
    return true;
  }
  // Otherwise, show if matches user's language OR interaction is for "both"
  return (
    interactionLanguage === userPreference || interactionLanguage === "both"
  );
}
