import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ---------------------------------------------------------------------------
// Course Library — a standalone course-hosting system for migrating GHL
// courses to CMB Lab. Separate from the legacy /admin/courses (Mux) and the
// audio-course feature.
//
// Structure: Course → Module → Lesson, where each lesson has a type
// (video / text / quiz / download) and a type-specific content JSON blob.
// ---------------------------------------------------------------------------

export const courseLibraryLessonTypeEnum = pgEnum(
  "course_library_lesson_type",
  [
    "video",
    "text",
    "quiz",
    "download",
    "audio",
    "form",
    "text_assignment",
    "listening_practice",
    "vocal_hack",
    "diary",
  ],
);

// Visual style of a module's stop on the student roadmap:
// lesson = dark blue, cm_school = light blue, custom_goal = yellow.
export const courseLibraryModuleMapStyleEnum = pgEnum(
  "course_library_module_map_style",
  ["lesson", "cm_school", "custom_goal"],
);

// Course visibility:
// - draft:     work in progress; not visible on the student-facing library
// - preview:   visible only to staff (admin/coach) for review before launch
// - published: visible to everyone with the course_library feature
export const courseLibraryCourseStatusEnum = pgEnum(
  "course_library_course_status",
  ["draft", "preview", "published"],
);

// Top-level course container.
export const courseLibraryCourses = pgTable(
  "course_library_courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    coverImageUrl: text("cover_image_url"),
    // Kept in sync with `status` (isPublished === status === "published") for
    // backward compatibility; `status` is the source of truth for visibility.
    isPublished: boolean("is_published").notNull().default(false),
    status: courseLibraryCourseStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("course_library_courses_sort_idx").on(table.sortOrder),
    index("course_library_courses_published_idx").on(table.isPublished),
    index("course_library_courses_status_idx").on(table.status),
  ],
);

// Module inside a course.
export const courseLibraryModules = pgTable(
  "course_library_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courseLibraryCourses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Shortened title shown on the student roadmap stop; falls back to title.
    shortTitle: text("short_title"),
    mapStyle: courseLibraryModuleMapStyleEnum("map_style")
      .notNull()
      .default("lesson"),
    // Optional section band label (e.g. "Week 1"); a new band starts on the
    // map whenever this differs from the previous module's label.
    weekLabel: text("week_label"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("course_library_modules_course_idx").on(table.courseId),
    index("course_library_modules_sort_idx").on(table.sortOrder),
  ],
);

// A single lesson. `lessonType` determines the shape of `content`.
export const courseLibraryLessons = pgTable(
  "course_library_lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseLibraryModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lessonType: courseLibraryLessonTypeEnum("lesson_type").notNull(),
    content: jsonb("content").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("course_library_lessons_module_idx").on(table.moduleId),
    index("course_library_lessons_sort_idx").on(table.sortOrder),
  ],
);

// Per-user per-lesson progress record.
export const courseLibraryLessonProgress = pgTable(
  "course_library_lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLibraryLessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at"),
    videoWatchedPercent: integer("video_watched_percent").notNull().default(0),
    quizScore: integer("quiz_score"),
    quizAnswers: jsonb("quiz_answers"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("course_library_lesson_progress_user_lesson_unique").on(
      table.userId,
      table.lessonId,
    ),
    index("course_library_lesson_progress_user_idx").on(table.userId),
  ],
);

export const flashcardSaves = pgTable(
  "flashcard_saves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    chinese: text("chinese").notNull(),
    simplified: text("simplified"),
    pinyin: text("pinyin"),
    jyutping: text("jyutping"),
    english: text("english"),
    sourceType: text("source_type").notNull().default("other"),
    sourceLabel: text("source_label").notNull().default("Flashcards"),
    sourceId: text("source_id"),
    sourceUrl: text("source_url"),
    language: text("language").notNull().default("unknown"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("flashcard_saves_user_content_key_unique").on(
      table.userId,
      table.contentKey,
    ),
    index("flashcard_saves_user_id_idx").on(table.userId),
    index("flashcard_saves_source_type_idx").on(table.sourceType),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const courseLibraryCoursesRelations = relations(
  courseLibraryCourses,
  ({ many, one }) => ({
    modules: many(courseLibraryModules),
    creator: one(users, {
      fields: [courseLibraryCourses.createdBy],
      references: [users.id],
    }),
  }),
);

export const courseLibraryModulesRelations = relations(
  courseLibraryModules,
  ({ one, many }) => ({
    course: one(courseLibraryCourses, {
      fields: [courseLibraryModules.courseId],
      references: [courseLibraryCourses.id],
    }),
    lessons: many(courseLibraryLessons),
  }),
);

export const courseLibraryLessonsRelations = relations(
  courseLibraryLessons,
  ({ one, many }) => ({
    module: one(courseLibraryModules, {
      fields: [courseLibraryLessons.moduleId],
      references: [courseLibraryModules.id],
    }),
    progress: many(courseLibraryLessonProgress),
  }),
);

export const courseLibraryLessonProgressRelations = relations(
  courseLibraryLessonProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [courseLibraryLessonProgress.userId],
      references: [users.id],
    }),
    lesson: one(courseLibraryLessons, {
      fields: [courseLibraryLessonProgress.lessonId],
      references: [courseLibraryLessons.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CourseLibraryCourse = typeof courseLibraryCourses.$inferSelect;
export type NewCourseLibraryCourse = typeof courseLibraryCourses.$inferInsert;

export type CourseLibraryCourseStatus =
  (typeof courseLibraryCourseStatusEnum.enumValues)[number];

export type CourseLibraryModule = typeof courseLibraryModules.$inferSelect;
export type NewCourseLibraryModule = typeof courseLibraryModules.$inferInsert;
export type CourseLibraryModuleMapStyle =
  (typeof courseLibraryModuleMapStyleEnum.enumValues)[number];

export type CourseLibraryLesson = typeof courseLibraryLessons.$inferSelect;
export type NewCourseLibraryLesson = typeof courseLibraryLessons.$inferInsert;

export type CourseLibraryLessonProgress =
  typeof courseLibraryLessonProgress.$inferSelect;

export type FlashcardSave = typeof flashcardSaves.$inferSelect;
export type NewFlashcardSave = typeof flashcardSaves.$inferInsert;

// ---------------------------------------------------------------------------
// Content shapes per lesson type — kept as TS types, validated at the API layer
// ---------------------------------------------------------------------------

export interface CourseLibraryAttachment {
  url: string;
  filename: string;
  sizeBytes: number;
}

export interface CourseLibraryVideoContent {
  videoUrl: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  transcript?: string;
  description?: string;
  attachments?: CourseLibraryAttachment[];
}

export interface CourseLibraryTextContent {
  body: string;
  thumbnailUrl?: string;
  attachments?: CourseLibraryAttachment[];
}

export type CourseLibraryQuizQuestionType = "single" | "multiple" | "true_false";

export interface CourseLibraryQuizOption {
  id: string;
  text: string;
}

export interface CourseLibraryQuizQuestion {
  id: string;
  prompt: string;
  type: CourseLibraryQuizQuestionType;
  options: CourseLibraryQuizOption[];
  correctOptionIds: string[];
  explanation?: string;
  points: number;
}

export interface CourseLibraryQuizContent {
  description?: string;
  passingScore: number;
  questions: CourseLibraryQuizQuestion[];
}

export interface CourseLibraryDownloadContent {
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  description?: string;
}

export interface CourseLibraryAudioContent {
  audioUrl: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  transcript?: string;
  description?: string;
  attachments?: CourseLibraryAttachment[];
}

export interface CourseLibraryFormContent {
  embedUrl: string;
  embedHeight?: number;
  description?: string;
  embedSource?: string;
}

export interface CourseLibraryTextAssignmentSentencePrompt {
  id: string;
  label: string;
  description: string;
  order: number;
}

export interface CourseLibraryTextAssignmentContent {
  /** Assignment instructions — rich text HTML (same editor format as other lessons). */
  description: string;
  sentencePrompts: CourseLibraryTextAssignmentSentencePrompt[];
}

/**
 * One sentence in a Listening Practice lesson. Students hear the audio (either
 * auto-generated TTS from `chinese`, or the optional `audioUrl` override) and
 * type its pinyin; the `pinyin` model answer (auto-generated on input, but
 * admin-editable) is the source of truth for auto-checking.
 */
export interface CourseLibraryListeningPracticeSentence {
  id: string;
  order: number;
  /** Chinese characters read aloud. Drives both TTS and the reveal display. */
  chinese: string;
  /** Model-answer pinyin (space-separated, one syllable per character). */
  pinyin: string;
  /** English translation shown beneath the Chinese (auto-generated, editable). */
  english?: string;
  /** Optional human-recording override URL; when absent, audio is TTS. */
  audioUrl?: string | null;
}

export interface CourseLibraryListeningPracticeContent {
  /** Instructions shown above the sentences — rich text HTML. */
  description: string;
  sentences: CourseLibraryListeningPracticeSentence[];
}

/**
 * One sentence in a Vocal Hack lesson: students watch the coach video, then
 * record themselves reading the same sentence. Pinyin/English are
 * auto-generated from the Chinese when the admin types it, but stay editable.
 */
export interface CourseLibraryVocalHackSentence {
  id: string;
  order: number;
  /** Coach demonstration video (private blob URL; streamed via proxy). */
  videoUrl?: string | null;
  chinese: string;
  /** Display pinyin (space-separated, one syllable per character). */
  pinyin: string;
  english: string;
}

export interface CourseLibraryVocalHackContent {
  /** Instructions shown above the sentences — rich text HTML. */
  description: string;
  sentences: CourseLibraryVocalHackSentence[];
}

/**
 * Diary lesson: the student writes a short paragraph (segmented into sentences
 * for the pinyin/English display + reviewer corrections) and submits an audio
 * recording of themselves reading it. Only instructions are configured; there
 * are no per-sentence prompts.
 */
export interface CourseLibraryDiaryContent {
  /** Instructions shown above the diary box — rich text HTML. */
  description: string;
}

export type CourseLibraryLessonContent =
  | CourseLibraryVideoContent
  | CourseLibraryTextContent
  | CourseLibraryQuizContent
  | CourseLibraryDownloadContent
  | CourseLibraryAudioContent
  | CourseLibraryFormContent
  | CourseLibraryTextAssignmentContent
  | CourseLibraryListeningPracticeContent
  | CourseLibraryVocalHackContent
  | CourseLibraryDiaryContent;
