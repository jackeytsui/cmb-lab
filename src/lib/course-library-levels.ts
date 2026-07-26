// ---------------------------------------------------------------------------
// Course Library level sequence — Foundations → Intermediate → Advanced.
//
// The dual-language blueprint courses are titled e.g.
// "The Canto to Mando Blueprint - Foundations"; the level is inferred from the
// title so the roadmap can tell students which level the final stop unlocks,
// and so the hard cross-course lock (lib/course-level-access.ts) knows which
// previous level must be completed first.
//
// This file is pure title-parsing (safe for client components); everything
// that touches the database lives in course-level-access.ts.
// ---------------------------------------------------------------------------

export type CourseLevelKey = "foundations" | "intermediate" | "advanced";

/** Levels behind the hard lock (Foundations is always open). */
export type GatedCourseLevelKey = Exclude<CourseLevelKey, "foundations">;

interface LevelStep {
  key: CourseLevelKey;
  /** Matches the level token anywhere in the course title. */
  pattern: RegExp;
  /** Display name of this level. */
  label: string;
}

const LEVEL_SEQUENCE: LevelStep[] = [
  { key: "foundations", pattern: /foundation/i, label: "Foundations" },
  { key: "intermediate", pattern: /intermediate/i, label: "Intermediate" },
  { key: "advanced", pattern: /advanced/i, label: "Advanced" },
];

export interface CourseLevelInfo {
  /** Stable key of the course's level, e.g. "foundations". */
  key: CourseLevelKey;
  /** Display name of the course's level, e.g. "Foundations". */
  label: string;
  /** The level that must be completed before this one, or null for the first. */
  prevKey: CourseLevelKey | null;
  prevLabel: string | null;
  /** Display name of the next level up, or null for the final level. */
  nextLabel: string | null;
}

/** Infer a course's place in the level sequence from its title.
 *  Returns null for courses outside the leveled blueprint sequence. */
export function getCourseLevelInfo(courseTitle: string): CourseLevelInfo | null {
  const index = LEVEL_SEQUENCE.findIndex((step) =>
    step.pattern.test(courseTitle),
  );
  if (index === -1) return null;
  const prev = LEVEL_SEQUENCE[index - 1] ?? null;
  const next = LEVEL_SEQUENCE[index + 1] ?? null;
  return {
    key: LEVEL_SEQUENCE[index].key,
    label: LEVEL_SEQUENCE[index].label,
    prevKey: prev?.key ?? null,
    prevLabel: prev?.label ?? null,
    nextLabel: next?.label ?? null,
  };
}

/** Display label for a level key, e.g. "intermediate" → "Intermediate". */
export function levelLabel(key: CourseLevelKey): string {
  return LEVEL_SEQUENCE.find((step) => step.key === key)?.label ?? key;
}

/** All levels in course order, first to last. */
export const COURSE_LEVEL_ORDER: CourseLevelKey[] = [
  "foundations",
  "intermediate",
  "advanced",
];

/** Gated levels in unlock order (used to find a student's next locked level). */
export const GATED_LEVELS: GatedCourseLevelKey[] = ["intermediate", "advanced"];

/** GHL contact tag mirrored for an early-unlock grant, so the team can see a
 *  student's unlock state directly in GoHighLevel. */
export function ghlLevelUnlockTag(level: GatedCourseLevelKey): string {
  return `CMB Level Unlocked: ${levelLabel(level)}`;
}
