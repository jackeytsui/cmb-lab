export const BLUEPRINT_COURSE_TITLES = {
  Foundations: "The Canto to Mando Blueprint - Foundations",
  Intermediate: "The Canto to Mando Blueprint - Intermediate",
  Advanced: "The Canto to Mando Blueprint - Advanced",
} as const;

export type BlueprintLevel = keyof typeof BLUEPRINT_COURSE_TITLES;

export const GHL_PROGRESS_CONCEPTS = {
  level: "course_progress_level",
  lessonNumber: "course_progress_lesson_number",
  foundationsCompletedAt: "course_progress_foundations_completed_at",
  intermediateCompletedAt: "course_progress_intermediate_completed_at",
  advancedCompletedAt: "course_progress_advanced_completed_at",
} as const;

export interface GhlCustomFieldValue {
  id: string;
  value: unknown;
}

export interface GhlProgressFieldIds {
  level: string;
  lessonNumber: string;
  foundationsCompletedAt: string;
  intermediateCompletedAt: string;
  advancedCompletedAt: string;
}

export interface GhlCourseProgressSnapshot {
  level:
    | BlueprintLevel
    | "Finished_CMBP_Course"
    | "Cantonese_Improvement_Course"
    | null;
  lessonNumber: number | null;
  completedAt: Partial<Record<BlueprintLevel, Date>>;
  hasAnyProgressValue: boolean;
}

export interface CourseStructure {
  id: string;
  level: BlueprintLevel;
  modules: Array<{
    id: string;
    title: string;
    lessonIds: string[];
  }>;
}

export interface CourseProgressPlan {
  accessCourseIds: string[];
  lessonCompletions: Array<{
    lessonId: string;
    completedAt: Date;
  }>;
  status:
    | "planned"
    | "no-progress-values"
    | "custom-course-skipped"
    | "unknown-level"
    | "invalid-lesson-number"
    | "lesson-module-not-found";
}

export interface CourseAccessChange {
  courseId: string;
  userId: string;
}

/**
 * Compare the system-managed access roster with the latest successful GHL
 * audit. Only audited users are eligible for removal, so a transient fetch
 * failure can never lock out an unchecked student.
 */
export function diffCourseProgressAccess(params: {
  currentByCourse: ReadonlyMap<string, ReadonlySet<string>>;
  expectedByCourse: ReadonlyMap<string, ReadonlySet<string>>;
  scopedUserIds: ReadonlySet<string>;
}): { toAdd: CourseAccessChange[]; toRemove: CourseAccessChange[] } {
  const toAdd: CourseAccessChange[] = [];
  const toRemove: CourseAccessChange[] = [];
  const courseIds = new Set([
    ...params.currentByCourse.keys(),
    ...params.expectedByCourse.keys(),
  ]);

  for (const courseId of courseIds) {
    const current = params.currentByCourse.get(courseId) ?? new Set<string>();
    const expected = params.expectedByCourse.get(courseId) ?? new Set<string>();
    for (const userId of params.scopedUserIds) {
      if (expected.has(userId) && !current.has(userId)) {
        toAdd.push({ courseId, userId });
      } else if (!expected.has(userId) && current.has(userId)) {
        toRemove.push({ courseId, userId });
      }
    }
  }

  return { toAdd, toRemove };
}

const BLUEPRINT_LEVELS: BlueprintLevel[] = [
  "Foundations",
  "Intermediate",
  "Advanced",
];

function fieldValue(customFields: GhlCustomFieldValue[], id: string): unknown {
  return customFields.find((field) => field.id === id)?.value;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function parseDate(value: unknown): Date | null {
  if (!hasValue(value)) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLessonNumber(value: unknown): number | null {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseLevel(value: unknown): GhlCourseProgressSnapshot["level"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "foundations") return "Foundations";
  if (normalized === "intermediate") return "Intermediate";
  if (normalized === "advanced") return "Advanced";
  if (normalized === "finished_cmbp_course") return "Finished_CMBP_Course";
  if (normalized === "cantonese_improvement_course") {
    return "Cantonese_Improvement_Course";
  }
  return null;
}

export function parseGhlCourseProgress(
  customFields: GhlCustomFieldValue[],
  fieldIds: GhlProgressFieldIds,
): GhlCourseProgressSnapshot {
  const rawLevel = fieldValue(customFields, fieldIds.level);
  const rawLessonNumber = fieldValue(customFields, fieldIds.lessonNumber);
  const rawFoundationsDate = fieldValue(
    customFields,
    fieldIds.foundationsCompletedAt,
  );
  const rawIntermediateDate = fieldValue(
    customFields,
    fieldIds.intermediateCompletedAt,
  );
  const rawAdvancedDate = fieldValue(customFields, fieldIds.advancedCompletedAt);

  const completedAt: Partial<Record<BlueprintLevel, Date>> = {};
  const foundationsDate = parseDate(rawFoundationsDate);
  const intermediateDate = parseDate(rawIntermediateDate);
  const advancedDate = parseDate(rawAdvancedDate);
  if (foundationsDate) completedAt.Foundations = foundationsDate;
  if (intermediateDate) completedAt.Intermediate = intermediateDate;
  if (advancedDate) completedAt.Advanced = advancedDate;

  return {
    level: parseLevel(rawLevel),
    lessonNumber: parseLessonNumber(rawLessonNumber),
    completedAt,
    hasAnyProgressValue: [
      rawLevel,
      rawLessonNumber,
      rawFoundationsDate,
      rawIntermediateDate,
      rawAdvancedDate,
    ].some(hasValue),
  };
}

function lessonModuleIndex(
  course: CourseStructure,
  lessonNumber: number,
): number {
  const pattern = new RegExp(`^lesson\\s+${lessonNumber}(?:\\s*:|\\s*$)`, "i");
  return course.modules.findIndex((courseModule) =>
    pattern.test(courseModule.title.trim()),
  );
}

export function buildCourseProgressPlan(
  snapshot: GhlCourseProgressSnapshot,
  courses: CourseStructure[],
  syncedAt = new Date(),
): CourseProgressPlan {
  const courseByLevel = new Map(courses.map((course) => [course.level, course]));
  const accessCourseIds = new Set<string>();
  const lessonCompletions = new Map<
    string,
    { lessonId: string; completedAt: Date }
  >();

  const completeModules = (
    course: CourseStructure,
    modules: CourseStructure["modules"],
    completedAt: Date,
  ) => {
    accessCourseIds.add(course.id);
    for (const courseModule of modules) {
      for (const lessonId of courseModule.lessonIds) {
        const existing = lessonCompletions.get(lessonId);
        if (!existing || completedAt.getTime() < existing.completedAt.getTime()) {
          lessonCompletions.set(lessonId, { lessonId, completedAt });
        }
      }
    }
  };

  for (const level of BLUEPRINT_LEVELS) {
    const completionDate = snapshot.completedAt[level];
    const course = courseByLevel.get(level);
    if (completionDate && course) {
      completeModules(course, course.modules, completionDate);
    }
  }

  if (!snapshot.hasAnyProgressValue) {
    const foundations = courseByLevel.get("Foundations");
    if (foundations) accessCourseIds.add(foundations.id);
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "no-progress-values",
    };
  }

  if (snapshot.level === "Cantonese_Improvement_Course") {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "custom-course-skipped",
    };
  }

  if (snapshot.level === "Finished_CMBP_Course") {
    for (const level of BLUEPRINT_LEVELS) {
      const course = courseByLevel.get(level);
      if (course) {
        completeModules(
          course,
          course.modules,
          snapshot.completedAt[level] ?? syncedAt,
        );
      }
    }
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "planned",
    };
  }

  if (!snapshot.level) {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "unknown-level",
    };
  }

  const currentLevelIndex = BLUEPRINT_LEVELS.indexOf(snapshot.level);
  for (let index = 0; index < currentLevelIndex; index += 1) {
    const level = BLUEPRINT_LEVELS[index];
    const course = courseByLevel.get(level);
    if (course) {
      completeModules(
        course,
        course.modules,
        snapshot.completedAt[level] ?? syncedAt,
      );
    }
  }

  const currentCourse = courseByLevel.get(snapshot.level);
  if (!currentCourse) {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "unknown-level",
    };
  }
  accessCourseIds.add(currentCourse.id);

  if (snapshot.completedAt[snapshot.level]) {
    completeModules(
      currentCourse,
      currentCourse.modules,
      snapshot.completedAt[snapshot.level]!,
    );
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "planned",
    };
  }

  if (snapshot.lessonNumber === null || snapshot.lessonNumber === 0) {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "planned",
    };
  }

  if (snapshot.lessonNumber < 1 || snapshot.lessonNumber > 13) {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "invalid-lesson-number",
    };
  }

  const targetModuleIndex = lessonModuleIndex(
    currentCourse,
    snapshot.lessonNumber,
  );
  if (targetModuleIndex < 0) {
    return {
      accessCourseIds: [...accessCourseIds],
      lessonCompletions: [...lessonCompletions.values()],
      status: "lesson-module-not-found",
    };
  }

  // "Student is at Lesson N" means every preceding module is complete and
  // Lesson N is the next/current stop. We deliberately leave the target
  // module incomplete so CMB Lab never overstates progress.
  completeModules(
    currentCourse,
    currentCourse.modules.slice(0, targetModuleIndex),
    syncedAt,
  );

  return {
    accessCourseIds: [...accessCourseIds],
    lessonCompletions: [...lessonCompletions.values()],
    status: "planned",
  };
}
