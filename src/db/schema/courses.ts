import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Courses table - top level of content hierarchy
export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  isPublished: boolean("is_published").notNull().default(false),
  previewLessonCount: integer("preview_lesson_count").notNull().default(3),
  sortOrder: integer("sort_order").notNull().default(0),
  searchPinyin: text("search_pinyin"),
  searchJyutping: text("search_jyutping"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

// Modules table - Course -> Module
export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("modules_course_id_idx").on(table.courseId),
]);

// Lessons table - Module -> Lesson
export const lessons = pgTable("lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"), // Rich text content for the lesson
  muxPlaybackId: text("mux_playback_id"),
  muxAssetId: text("mux_asset_id"),
  durationSeconds: integer("duration_seconds"),
  sortOrder: integer("sort_order").notNull().default(0),
  searchPinyin: text("search_pinyin"),
  searchJyutping: text("search_jyutping"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("lessons_module_id_idx").on(table.moduleId),
]);

// Lesson Attachments table - Lesson -> Attachments (Links/Files)
export const lessonAttachments = pgTable("lesson_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("link"), // link, file
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("lesson_attachments_lesson_id_idx").on(table.lessonId),
]);

// Relations: Course has many Modules
export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(modules),
}));

// Relations: Module belongs to Course, has many Lessons
export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, {
    fields: [modules.courseId],
    references: [courses.id],
  }),
  lessons: many(lessons),
}));

// Relations: Lesson belongs to Module
export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, {
    fields: [lessons.moduleId],
    references: [modules.id],
  }),
  attachments: many(lessonAttachments),
}));

// Relations: Attachment belongs to Lesson
export const lessonAttachmentsRelations = relations(lessonAttachments, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonAttachments.lessonId],
    references: [lessons.id],
  }),
}));

// Type inference
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type LessonAttachment = typeof lessonAttachments.$inferSelect;
export type NewLessonAttachment = typeof lessonAttachments.$inferInsert;
