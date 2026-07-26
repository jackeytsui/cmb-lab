// ---------------------------------------------------------------------------
// Course Library level sequence — Foundations → Intermediate → Advanced.
//
// The dual-language blueprint courses are titled e.g.
// "The Canto to Mando Blueprint - Foundations"; the level is inferred from the
// title so the roadmap can tell students which level the final stop unlocks.
// ---------------------------------------------------------------------------

interface LevelStep {
  /** Matches the level token anywhere in the course title. */
  pattern: RegExp;
  /** Display name of this level. */
  label: string;
  /** Display name of the level that finishing this one unlocks. */
  nextLabel: string | null;
}

const LEVEL_SEQUENCE: LevelStep[] = [
  { pattern: /foundation/i, label: "Foundations", nextLabel: "Intermediate" },
  { pattern: /intermediate/i, label: "Intermediate", nextLabel: "Advanced" },
  { pattern: /advanced/i, label: "Advanced", nextLabel: null },
];

export interface CourseLevelInfo {
  /** Display name of the course's level, e.g. "Foundations". */
  label: string;
  /** Display name of the next level up, or null for the final level. */
  nextLabel: string | null;
}

/** Infer a course's place in the level sequence from its title.
 *  Returns null for courses outside the leveled blueprint sequence. */
export function getCourseLevelInfo(courseTitle: string): CourseLevelInfo | null {
  for (const step of LEVEL_SEQUENCE) {
    if (step.pattern.test(courseTitle)) {
      return { label: step.label, nextLabel: step.nextLabel };
    }
  }
  return null;
}
