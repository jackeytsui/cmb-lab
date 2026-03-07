// ============================================================
// Utility: parseBlankSentence
// ============================================================

export type BlankSegment =
  | { type: "text"; value: string }
  | { type: "blank"; index: number };

/**
 * Parse a sentence with {{blank}} placeholders into an array of text and blank segments.
 *
 * @example
 * parseBlankSentence("I {{blank}} to the {{blank}}")
 * // Returns:
 * // [
 * //   { type: "text", value: "I " },
 * //   { type: "blank", index: 0 },
 * //   { type: "text", value: " to the " },
 * //   { type: "blank", index: 1 },
 * // ]
 */
export function parseBlankSentence(template: string): BlankSegment[] {
  const parts = template.split(/\{\{blank\}\}/g);
  const segments: BlankSegment[] = [];
  let blankIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    // Add text segment if non-empty
    if (parts[i] !== "") {
      segments.push({ type: "text", value: parts[i] });
    }

    // Add blank segment between parts (not after the last part)
    if (i < parts.length - 1) {
      segments.push({ type: "blank", index: blankIndex });
      blankIndex++;
    }
  }

  return segments;
}
