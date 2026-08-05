export const VIDEOASK_VOCAL_HACK_COURSES = {
  foundations: "The Canto to Mando Blueprint - Foundations",
  intermediate: "The Canto to Mando Blueprint - Intermediate",
  advanced: "The Canto to Mando Blueprint - Advanced",
  cantonese: "Confident Cantonese Kickstarter",
} as const;

export type VideoAskVocalHackGroup = {
  key: string;
  label: string;
  language: "mandarin" | "cantonese";
};

/**
 * The six course-content folders demonstrated in the team's Loom. VideoAsk's
 * API currently returns folder IDs but not folder names, so these durable IDs
 * are labelled from the verified source inventory instead of being guessed at
 * from a form's mutable list position.
 */
export const VIDEOASK_VOCAL_HACK_GROUPS: VideoAskVocalHackGroup[] = [
  {
    key: "375af374-bc92-4346-bc55-78912e21426e",
    label: "CMB Foundation",
    language: "mandarin",
  },
  {
    key: "66ba44e1-4bbf-4a56-a2c2-40c6baee8df6",
    label: "CMB Intermediate",
    language: "mandarin",
  },
  {
    key: "cc0f2b83-ded9-42db-84e0-7a084cd48a61",
    label: "CMB Advanced",
    language: "mandarin",
  },
  {
    key: "f4d1813d-f3d0-4f0a-b145-5431ebeb7c7f",
    label: "CM School",
    language: "mandarin",
  },
  {
    key: "79cccdd1-605e-4b70-8d0f-d5666bf0b455",
    label: "Canto Courses",
    language: "cantonese",
  },
  {
    key: "f4c57358-c872-432b-96be-3d23a7434887",
    label: "Customized",
    language: "mandarin",
  },
];

export const VIDEOASK_VOCAL_HACK_GROUP_KEYS =
  VIDEOASK_VOCAL_HACK_GROUPS.map((group) => group.key);

export type PlacementCourse = {
  id: string;
  title: string;
};

export type PlacementLesson = {
  id: string;
  title: string;
  lessonType: string;
  sortOrder: number;
};

export type PlacementModule = {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  lessons: PlacementLesson[];
};

export type PlacementCatalog = {
  courses: PlacementCourse[];
  modules: PlacementModule[];
};

export type PlacementConfidence = "exact" | "high" | "review" | "manual";

export type VideoAskVocalHackPlacement = {
  sourceGroup: VideoAskVocalHackGroup;
  language: "mandarin" | "cantonese";
  targetCourse: PlacementCourse | null;
  targetModule: PlacementModule | null;
  targetLesson: PlacementLesson | null;
  targetLessonTitle: string | null;
  action: "replace_placeholder" | "create_lesson" | "manual";
  confidence: PlacementConfidence;
  score: number;
  reason: string;
};

const STOP_WORDS = new Set([
  "a",
  "about",
  "and",
  "at",
  "for",
  "from",
  "how",
  "in",
  "of",
  "the",
  "to",
  "with",
  "your",
]);

export function normalizePlacementTitle(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\bcanto\s+irl\b/g, " ")
    .replace(/\bcm\s+school\b/g, " ")
    .replace(/\bvocal\s+(?:messaging\s+)?hacks?\b/g, " ")
    .replace(/\b(?:breakdown|listening)\b/g, " ")
    .replace(/\bconversations\b/g, "conversation")
    .replace(/\bdirections\b/g, "direction")
    .replace(/\bsee\s+a\s+doctor\b/g, "seeing doctor")
    .replace(/\bseeing\s+a\s+doctor\b/g, "seeing doctor")
    .replace(/\bfoundations\b/g, "foundation")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .trim();
}

function titleTokens(value: string) {
  return normalizePlacementTitle(value)
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

export function placementTitleScore(source: string, target: string) {
  const left = normalizePlacementTitle(source);
  const right = normalizePlacementTitle(target);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

export function isTargetVocalHackForm(
  sourceFolderKey: string,
  formTitle: string,
) {
  const group = VIDEOASK_VOCAL_HACK_GROUPS.find(
    (candidate) => candidate.key === sourceFolderKey,
  );
  if (!group) return false;
  // The Customized folder also contains two hiring forms. Only its three
  // explicit Vocal Hack forms are course material.
  return group.label !== "Customized" || /vocal\s+hack/i.test(formTitle);
}

function findCourse(catalog: PlacementCatalog, title: string) {
  return catalog.courses.find((course) => course.title === title) ?? null;
}

function modulesForCourse(catalog: PlacementCatalog, courseId: string) {
  return catalog.modules.filter((module) => module.courseId === courseId);
}

function vocalHackLesson(targetModule: PlacementModule, sourceTitle?: string) {
  const candidates = targetModule.lessons.filter((lesson) =>
    /vocal\s+(?:messaging\s+)?hack/i.test(lesson.title),
  );
  if (candidates.length === 0) return null;
  if (!sourceTitle) return candidates[0];
  return candidates
    .map((lesson) => ({
      lesson,
      score: placementTitleScore(sourceTitle, lesson.title),
    }))
    .sort((a, b) => b.score - a.score)[0]?.lesson ?? null;
}

function numberedPlacement(
  group: VideoAskVocalHackGroup,
  catalog: PlacementCatalog,
  sourceTitle: string,
  courseTitle: string,
  lessonNumber: number,
) {
  const course = findCourse(catalog, courseTitle);
  if (!course) return null;
  const targetModule = modulesForCourse(catalog, course.id).find((candidate) =>
    new RegExp(`^lesson\\s+${lessonNumber}(?:\\D|$)`, "i").test(candidate.title),
  );
  if (!targetModule) return null;
  const lesson = vocalHackLesson(targetModule);
  return {
    sourceGroup: group,
    language: group.language,
    targetCourse: course,
    targetModule,
    targetLesson: lesson,
    targetLessonTitle:
      lesson?.title ??
      `${courseTitle === VIDEOASK_VOCAL_HACK_COURSES.cantonese ? "Vocal Messaging Hack" : "VOCAL Messaging Hack"} ${lessonNumber}`,
    action: lesson ? "replace_placeholder" : "create_lesson",
    confidence: "exact",
    score: 1,
    reason: `The source and destination both identify lesson ${lessonNumber}.`,
  } satisfies VideoAskVocalHackPlacement;
}

function topicPlacement(
  group: VideoAskVocalHackGroup,
  catalog: PlacementCatalog,
  sourceTitle: string,
  topic: string,
  courseTitle: string,
  moduleFilter: (module: PlacementModule) => boolean,
) {
  const course = findCourse(catalog, courseTitle);
  if (!course) return null;
  const ranked = modulesForCourse(catalog, course.id)
    .filter(moduleFilter)
    .map((targetModule) => {
      const lesson = vocalHackLesson(targetModule, topic);
      const moduleScore = placementTitleScore(topic, targetModule.title);
      const lessonScore = lesson
        ? placementTitleScore(topic, lesson.title)
        : 0;
      return {
        targetModule,
        lesson,
        score: Math.max(moduleScore, lessonScore),
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.35) return null;
  const confidence: PlacementConfidence =
    best.score >= 0.99 ? "exact" : best.score >= 0.72 ? "high" : "review";
  return {
    sourceGroup: group,
    language: group.language,
    targetCourse: course,
    targetModule: best.targetModule,
    targetLesson: best.lesson,
    targetLessonTitle: best.lesson?.title ?? `${topic} (Vocal Hack)`,
    action: best.lesson ? "replace_placeholder" : "create_lesson",
    confidence,
    score: best.score,
    reason: best.lesson
      ? "Matched the source topic to an existing Vocal Hack placeholder."
      : "Matched the source topic to an existing course section; a Vocal Hack lesson will be added beside it.",
  } satisfies VideoAskVocalHackPlacement;
}

function manualPlacement(
  group: VideoAskVocalHackGroup,
  reason: string,
): VideoAskVocalHackPlacement {
  return {
    sourceGroup: group,
    language: group.language,
    targetCourse: null,
    targetModule: null,
    targetLesson: null,
    targetLessonTitle: null,
    action: "manual",
    confidence: "manual",
    score: 0,
    reason,
  };
}

export function recommendVocalHackPlacement(
  sourceFolderKey: string,
  sourceTitle: string,
  catalog: PlacementCatalog,
): VideoAskVocalHackPlacement | null {
  const group = VIDEOASK_VOCAL_HACK_GROUPS.find(
    (candidate) => candidate.key === sourceFolderKey,
  );
  if (!group || !isTargetVocalHackForm(sourceFolderKey, sourceTitle)) {
    return null;
  }

  if (group.label === "Customized") {
    return manualPlacement(
      group,
      "Customized Vocal Hacks need a student/course destination selected by an administrator.",
    );
  }

  const numberedMatch = sourceTitle.match(
    /vocal\s+hack\s+(?:beginner|intermediate|advanced)\s+(\d+)/i,
  );
  if (numberedMatch) {
    const level = /beginner/i.test(sourceTitle)
      ? "foundations"
      : /intermediate/i.test(sourceTitle)
        ? "intermediate"
        : "advanced";
    return (
      numberedPlacement(
        group,
        catalog,
        sourceTitle,
        VIDEOASK_VOCAL_HACK_COURSES[level],
        Number(numberedMatch[1]),
      ) ?? manualPlacement(group, "The numbered destination lesson was not found.")
    );
  }

  const toneMatch = sourceTitle.match(/tone\s+pair\s+vocal\s+hack\s*\(tone\s+(\d+)\)/i);
  if (toneMatch) {
    const course = findCourse(
      catalog,
      VIDEOASK_VOCAL_HACK_COURSES.foundations,
    );
    const targetModule = course
      ? modulesForCourse(catalog, course.id).find(
          (candidate) => normalizePlacementTitle(candidate.title) === "tone mastery",
        )
      : null;
    const lesson = targetModule
      ? targetModule.lessons.find(
          (candidate) =>
            normalizePlacementTitle(candidate.title) ===
            normalizePlacementTitle(sourceTitle),
        ) ?? null
      : null;
    if (!course || !targetModule) {
      return manualPlacement(group, "The Tone Mastery destination was not found.");
    }
    return {
      sourceGroup: group,
      language: "mandarin",
      targetCourse: course,
      targetModule,
      targetLesson: lesson,
      targetLessonTitle: lesson?.title ?? sourceTitle,
      action: lesson ? "replace_placeholder" : "create_lesson",
      confidence: "exact",
      score: 1,
      reason: `Matched Tone ${toneMatch[1]} to the same title in Tone Mastery.`,
    };
  }

  const cantoNumbered = sourceTitle.match(/canto\s+vocal\s+hacks?\s+(\d+)/i);
  if (cantoNumbered) {
    return (
      numberedPlacement(
        group,
        catalog,
        sourceTitle,
        VIDEOASK_VOCAL_HACK_COURSES.cantonese,
        Number(cantoNumbered[1]),
      ) ?? manualPlacement(group, "The numbered Cantonese destination was not found.")
    );
  }

  const schoolMatch = sourceTitle.match(
    /^(foundations?|intermediate|advanced)\s*\((.+)\)$/i,
  );
  if (schoolMatch) {
    const level = /^foundation/i.test(schoolMatch[1])
      ? "foundations"
      : /^intermediate/i.test(schoolMatch[1])
        ? "intermediate"
        : "advanced";
    return (
      topicPlacement(
        group,
        catalog,
        sourceTitle,
        schoolMatch[2],
        VIDEOASK_VOCAL_HACK_COURSES[level],
        (module) => /^cm\s+school\s*:/i.test(module.title),
      ) ?? manualPlacement(group, "No matching CM School section was found.")
    );
  }

  if (group.label === "Canto Courses") {
    return (
      topicPlacement(
        group,
        catalog,
        sourceTitle,
        sourceTitle,
        VIDEOASK_VOCAL_HACK_COURSES.cantonese,
        (module) => /^canto\s+irl\s*:/i.test(module.title),
      ) ?? manualPlacement(group, "No matching Canto IRL section was found.")
    );
  }

  return manualPlacement(group, "No safe automatic destination rule matched.");
}
