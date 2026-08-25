import { describe, expect, it } from "vitest";
import {
  buildCourseProgressPlan,
  parseGhlCourseProgress,
  type CourseStructure,
  type GhlProgressFieldIds,
} from "@/lib/ghl/course-progress-plan";

const fieldIds: GhlProgressFieldIds = {
  level: "level",
  lessonNumber: "lesson",
  foundationsCompletedAt: "m1",
  intermediateCompletedAt: "m2",
  advancedCompletedAt: "m3",
};

const courses: CourseStructure[] = [
  {
    id: "foundations",
    level: "Foundations",
    modules: [
      { id: "f-intro", title: "Chapter 1", lessonIds: ["f-intro-1"] },
      { id: "f-1", title: "Lesson 1: Pronouns", lessonIds: ["f-1-a", "f-1-b"] },
      { id: "f-extra", title: "CM School", lessonIds: ["f-extra-a"] },
      { id: "f-2", title: "Lesson 2: Possession", lessonIds: ["f-2-a"] },
    ],
  },
  {
    id: "intermediate",
    level: "Intermediate",
    modules: [
      { id: "i-intro", title: "A Change Before Intermediate", lessonIds: ["i-intro-a"] },
      { id: "i-1", title: "Lesson 1: Comparisons", lessonIds: ["i-1-a"] },
      { id: "i-2", title: "Lesson 2: Aspect", lessonIds: ["i-2-a"] },
    ],
  },
  {
    id: "advanced",
    level: "Advanced",
    modules: [
      { id: "a-intro", title: "Welcome", lessonIds: ["a-intro-a"] },
      { id: "a-1", title: "Lesson 1: Ability", lessonIds: ["a-1-a"] },
    ],
  },
];

function fields(values: Record<string, unknown>) {
  return Object.entries(values).map(([id, value]) => ({ id, value }));
}

describe("GHL Blueprint progress planning", () => {
  it("unlocks the reported current lesson without completing it", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ level: "Foundations", lesson: 2 }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(
      snapshot,
      courses,
      new Date("2026-08-25T12:00:00Z"),
    );

    expect(plan.status).toBe("planned");
    expect(plan.accessCourseIds).toEqual(["foundations"]);
    expect(plan.lessonCompletions.map((entry) => entry.lessonId)).toEqual([
      "f-intro-1",
      "f-1-a",
      "f-1-b",
      "f-extra-a",
    ]);
    expect(plan.lessonCompletions.map((entry) => entry.lessonId)).not.toContain(
      "f-2-a",
    );
  });

  it("completes prior courses when the student is in a later level", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ level: "Advanced", lesson: 1 }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(snapshot, courses);

    expect(plan.accessCourseIds).toEqual([
      "foundations",
      "intermediate",
      "advanced",
    ]);
    expect(plan.lessonCompletions.map((entry) => entry.lessonId)).toEqual(
      expect.arrayContaining([
        "f-intro-1",
        "f-2-a",
        "i-intro-a",
        "i-2-a",
        "a-intro-a",
      ]),
    );
    expect(plan.lessonCompletions.map((entry) => entry.lessonId)).not.toContain(
      "a-1-a",
    );
  });

  it("uses explicit completion dates even when the level is missing", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ m1: "2026-04-03T00:00:00.000Z" }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(snapshot, courses);

    expect(plan.accessCourseIds).toEqual(["foundations"]);
    expect(plan.lessonCompletions).toHaveLength(5);
    expect(plan.lessonCompletions[0].completedAt.toISOString()).toBe(
      "2026-04-03T00:00:00.000Z",
    );
  });

  it("completes all Blueprint courses for a finished student", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ level: "Finished_CMBP_Course", lesson: 13 }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(snapshot, courses);

    expect(plan.status).toBe("planned");
    expect(plan.accessCourseIds).toHaveLength(3);
    expect(plan.lessonCompletions).toHaveLength(10);
  });

  it("leaves the not-yet-migrated improvement course alone", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ level: "Cantonese_Improvement_Course", lesson: 8 }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(snapshot, courses);

    expect(plan.status).toBe("custom-course-skipped");
    expect(plan.lessonCompletions).toEqual([]);
  });

  it("never guesses malformed or out-of-range lesson numbers", () => {
    const snapshot = parseGhlCourseProgress(
      fields({ level: "Foundations", lesson: -13 }),
      fieldIds,
    );
    const plan = buildCourseProgressPlan(snapshot, courses);

    expect(plan.status).toBe("invalid-lesson-number");
    expect(plan.lessonCompletions).toEqual([]);
  });
});
