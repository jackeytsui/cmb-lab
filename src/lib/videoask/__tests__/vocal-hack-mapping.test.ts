import { describe, expect, it } from "vitest";
import {
  VIDEOASK_VOCAL_HACK_COURSES,
  VIDEOASK_VOCAL_HACK_GROUPS,
  isTargetVocalHackForm,
  placementTitleScore,
  recommendVocalHackPlacement,
  type PlacementCatalog,
} from "../vocal-hack-mapping";

function groupKey(label: string) {
  const group = VIDEOASK_VOCAL_HACK_GROUPS.find(
    (candidate) => candidate.label === label,
  );
  if (!group) throw new Error(`Missing test group: ${label}`);
  return group.key;
}

const catalog: PlacementCatalog = {
  courses: [
    { id: "foundation", title: VIDEOASK_VOCAL_HACK_COURSES.foundations },
    { id: "intermediate", title: VIDEOASK_VOCAL_HACK_COURSES.intermediate },
    { id: "advanced", title: VIDEOASK_VOCAL_HACK_COURSES.advanced },
    { id: "canto", title: VIDEOASK_VOCAL_HACK_COURSES.cantonese },
  ],
  modules: [
    {
      id: "foundation-1",
      courseId: "foundation",
      title: "Lesson 1: Pronouns",
      sortOrder: 1,
      lessons: [
        {
          id: "foundation-vocal-1",
          title: "VOCAL Messaging Hack 1",
          lessonType: "text",
          sortOrder: 5,
        },
      ],
    },
    {
      id: "tone-mastery",
      courseId: "foundation",
      title: "Tone Mastery",
      sortOrder: 2,
      lessons: [
        {
          id: "tone-1",
          title: "Tone Pair Vocal Hack (Tone 1)",
          lessonType: "video",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "personal-intro",
      courseId: "foundation",
      title: "CM School: Personal Introduction",
      sortOrder: 3,
      lessons: [
        {
          id: "personal-intro-vocal",
          title: "Personal Introduction (Vocal Hack)",
          lessonType: "text",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "family",
      courseId: "foundation",
      title: "CM School: Talking About Your Family",
      sortOrder: 3,
      lessons: [
        {
          id: "family-vocal",
          title: "Asking about Family (Vocal Hack)",
          lessonType: "text",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "making-plans",
      courseId: "intermediate",
      title: "CM School: Making plans",
      sortOrder: 4,
      lessons: [
        {
          id: "making-plans-vocal",
          title: "Making plans (Vocal Hack)",
          lessonType: "text",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "passing-immigration",
      courseId: "intermediate",
      title: "CM School: Passing Immigration",
      sortOrder: 5,
      lessons: [
        {
          id: "immigration-vocal",
          title: "Passing Immigration in China (Vocal Hacks)",
          lessonType: "text",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "canto-1",
      courseId: "canto",
      title: "Lesson 1",
      sortOrder: 1,
      lessons: [
        {
          id: "canto-vocal-1",
          title: "VOCAL Messaging Hack 1",
          lessonType: "vocal_hack_canto",
          sortOrder: 2,
        },
      ],
    },
    {
      id: "canto-family",
      courseId: "canto",
      title: "Canto IRL: Talking About Your Family",
      sortOrder: 2,
      lessons: [
        {
          id: "canto-family-breakdown",
          title: "Talking About Your Family (Breakdown)",
          lessonType: "video",
          sortOrder: 0,
        },
      ],
    },
  ],
};

describe("VideoAsk Vocal Hack placement", () => {
  it("maps numbered foundation forms to their existing placeholder", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CMB Foundation"),
      "Vocal hack beginner 1",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "exact",
      action: "replace_placeholder",
      targetModule: { id: "foundation-1" },
      targetLesson: { id: "foundation-vocal-1" },
    });
  });

  it("maps tone-pair forms to Tone Mastery", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CMB Foundation"),
      "Tone Pair Vocal Hack (Tone 1)",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "exact",
      targetModule: { id: "tone-mastery" },
      targetLesson: { id: "tone-1" },
    });
  });

  it("prefers the CM School Vocal Hack lesson title over a looser module title", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CM School"),
      "Foundation (Asking about Family)",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "exact",
      targetModule: { id: "family" },
      targetLesson: { id: "family-vocal" },
    });
  });

  it("adds a Canto IRL Vocal Hack when the matching section has no placeholder", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("Canto Courses"),
      "Talking About Your Family",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "exact",
      action: "create_lesson",
      language: "cantonese",
      targetModule: { id: "canto-family" },
      targetLesson: null,
    });
  });

  it("excludes audited Customized and hiring artifacts from course migration", () => {
    const key = groupKey("Customized");
    expect(isTargetVocalHackForm(key)).toBe(false);
    expect(recommendVocalHackPlacement(key, "VOCAL HACK 1", catalog)).toBeNull();
  });

  it("maps Basic Introduction to the Personal Introduction placeholder", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CM School"),
      "Foundations (Basic Introduction)",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "exact",
      action: "replace_placeholder",
      targetModule: { id: "personal-intro" },
      targetLesson: { id: "personal-intro-vocal" },
    });
  });

  it("adds Airport Check-in beside Passing Immigration without overwriting it", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CM School"),
      "Intermediate (Tourist checking in at the airport)",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "high",
      action: "create_lesson",
      targetModule: { id: "passing-immigration" },
      targetLesson: null,
      targetLessonTitle: "Checking in at the Airport (Vocal Hack)",
    });
  });

  it("adds Travel Recommendations beside Making Plans", () => {
    const placement = recommendVocalHackPlacement(
      groupKey("CM School"),
      "Intermediate (Customers Travelling Recommendations)",
      catalog,
    );
    expect(placement).toMatchObject({
      confidence: "high",
      action: "create_lesson",
      targetModule: { id: "making-plans" },
      targetLesson: null,
      targetLessonTitle: "Travel Recommendations (Vocal Hack)",
    });
  });

  it("normalizes harmless title differences", () => {
    expect(
      placementTitleScore(
        "Conversations at the Hotel",
        "Canto IRL: Conversation at the Hotel (Vocal Hack)",
      ),
    ).toBeGreaterThan(0.7);
  });
});
