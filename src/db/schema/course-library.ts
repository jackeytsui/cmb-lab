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
  ["video", "text", "quiz", "download"],
);

// Top-level course container.
export const courseLibraryCourses = pgTable(
  "course_library_courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    coverImageUrl: text("cover_image_url"),
    isPublished: boolean("is_published").notNull().default(false),
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

export type CourseLibraryModule = typeof courseLibraryModules.$inferSelect;
export type NewCourseLibraryModule = typeof courseLibraryModules.$inferInsert;

export type CourseLibraryLesson = typeof courseLibraryLessons.$inferSelect;
export type NewCourseLibraryLesson = typeof courseLibraryLessons.$inferInsert;

export type CourseLibraryLessonProgress =
  typeof courseLibraryLessonProgress.$inferSelect;

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

export type CourseLibraryLessonContent =
  | CourseLibraryVideoContent
  | CourseLibraryTextContent
  | CourseLibraryQuizContent
  | CourseLibraryDownloadContent;
