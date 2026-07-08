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
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
} from "./course-library";

// ---------------------------------------------------------------------------
// Assignment Submissions — structured student submissions for assignment-type
// course-library lessons (first type: text_assignment). Designed so future
// assignment types (audio recording, audio upload, video) can reuse the same
// submission/review/assignment-of-reviewer flow: the type-specific payload
// lives in per-type child tables (assignment_submission_sentences for text)
// plus the jsonb `metadata` escape hatch.
// ---------------------------------------------------------------------------

// Future values: "video_assignment", ...
export const assignmentTypeEnum = pgEnum("assignment_type_kind", [
  "text_assignment",
  "vocal_hack",
]);

export const assignmentSubmissionStatusEnum = pgEnum(
  "assignment_submission_status",
  ["draft", "submitted", "assigned", "in_review", "reviewed"],
);

export const assignmentSentenceVerdictEnum = pgEnum(
  "assignment_sentence_verdict",
  ["correct", "needs_correction"],
);

// One submission per (lesson, student). Students may resubmit while the
// submission has not entered review (status draft/submitted).
export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLibraryLessons.id, { onDelete: "cascade" }),
    // Denormalized for dashboard querying/filtering.
    moduleId: uuid("module_id").references(() => courseLibraryModules.id, {
      onDelete: "set null",
    }),
    courseId: uuid("course_id").references(() => courseLibraryCourses.id, {
      onDelete: "set null",
    }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignmentType: assignmentTypeEnum("assignment_type")
      .notNull()
      .default("text_assignment"),
    status: assignmentSubmissionStatusEnum("status").notNull().default("draft"),
    assignedReviewerId: uuid("assigned_reviewer_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    // Reviewer who actually submitted the review.
    reviewerId: uuid("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at"),
    reviewStartedAt: timestamp("review_started_at"),
    reviewedAt: timestamp("reviewed_at"),
    autoScore: integer("auto_score"),
    finalScore: integer("final_score"),
    scoreOverridden: boolean("score_overridden").notNull().default(false),
    recordingUrl: text("recording_url"),
    // Optional reviewer comment (rich text HTML, same convention as lesson content).
    extraComment: text("extra_comment"),
    // When the student first opened the reviewed feedback (unread badge state).
    studentViewedAt: timestamp("student_viewed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_submissions_lesson_student_unique").on(
      table.lessonId,
      table.studentId,
    ),
    index("assignment_submissions_student_idx").on(table.studentId),
    index("assignment_submissions_status_idx").on(table.status),
    index("assignment_submissions_assigned_reviewer_idx").on(
      table.assignedReviewerId,
    ),
    index("assignment_submissions_course_idx").on(table.courseId),
  ],
);

// One row per configured sentence prompt in a text assignment submission.
// Prompt label/description are snapshotted so feedback stays stable even if
// the admin later edits the lesson config.
export const assignmentSubmissionSentences = pgTable(
  "assignment_submission_sentences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => assignmentSubmissions.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    promptLabel: text("prompt_label").notNull().default(""),
    promptDescription: text("prompt_description").notNull().default(""),
    chineseText: text("chinese_text").notNull(),
    generatedPinyin: text("generated_pinyin").notNull().default(""),
    generatedEnglish: text("generated_english").notNull().default(""),
    // Vocal hack: the student's audio recording for this sentence (private
    // blob URL; always streamed through the authenticated recordings proxy).
    audioUrl: text("audio_url"),
    // Vocal hack review: the reviewer's corrected/model sentence for this
    // recording (free text, with generated-then-editable pinyin + English).
    correctedChinese: text("corrected_chinese"),
    correctedPinyin: text("corrected_pinyin"),
    correctedEnglish: text("corrected_english"),
    // Reviewer's per-sentence correctness verdict (null until reviewed).
    reviewVerdict: assignmentSentenceVerdictEnum("review_verdict"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_submission_sentences_submission_prompt_unique").on(
      table.submissionId,
      table.promptId,
    ),
    index("assignment_submission_sentences_submission_idx").on(
      table.submissionId,
    ),
  ],
);

// Offset-based inline corrections inside a submitted sentence. The stored
// structured ranges are the source of truth; the red-strikethrough/green-bubble
// markup is rendered from these rows, never stored as HTML.
export const assignmentCorrections = pgTable(
  "assignment_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => assignmentSubmissionSentences.id, {
        onDelete: "cascade",
      }),
    // Exact character offsets into the sentence's chineseText: [start, end).
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    originalText: text("original_text").notNull(),
    suggestedChinese: text("suggested_chinese").notNull(),
    suggestedPinyin: text("suggested_pinyin").notNull().default(""),
    suggestedEnglish: text("suggested_english").notNull().default(""),
    note: text("note"),
    createdByReviewerId: uuid("created_by_reviewer_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("assignment_corrections_sentence_idx").on(table.sentenceId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const assignmentSubmissionsRelations = relations(
  assignmentSubmissions,
  ({ one, many }) => ({
    lesson: one(courseLibraryLessons, {
      fields: [assignmentSubmissions.lessonId],
      references: [courseLibraryLessons.id],
    }),
    module: one(courseLibraryModules, {
      fields: [assignmentSubmissions.moduleId],
      references: [courseLibraryModules.id],
    }),
    course: one(courseLibraryCourses, {
      fields: [assignmentSubmissions.courseId],
      references: [courseLibraryCourses.id],
    }),
    student: one(users, {
      fields: [assignmentSubmissions.studentId],
      references: [users.id],
      relationName: "assignmentSubmissionStudent",
    }),
    assignedReviewer: one(users, {
      fields: [assignmentSubmissions.assignedReviewerId],
      references: [users.id],
      relationName: "assignmentSubmissionAssignedReviewer",
    }),
    reviewer: one(users, {
      fields: [assignmentSubmissions.reviewerId],
      references: [users.id],
      relationName: "assignmentSubmissionReviewer",
    }),
    sentences: many(assignmentSubmissionSentences),
  }),
);

export const assignmentSubmissionSentencesRelations = relations(
  assignmentSubmissionSentences,
  ({ one, many }) => ({
    submission: one(assignmentSubmissions, {
      fields: [assignmentSubmissionSentences.submissionId],
      references: [assignmentSubmissions.id],
    }),
    corrections: many(assignmentCorrections),
  }),
);

export const assignmentCorrectionsRelations = relations(
  assignmentCorrections,
  ({ one }) => ({
    sentence: one(assignmentSubmissionSentences, {
      fields: [assignmentCorrections.sentenceId],
      references: [assignmentSubmissionSentences.id],
    }),
    createdByReviewer: one(users, {
      fields: [assignmentCorrections.createdByReviewerId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type NewAssignmentSubmission =
  typeof assignmentSubmissions.$inferInsert;

export type AssignmentSubmissionSentence =
  typeof assignmentSubmissionSentences.$inferSelect;
export type NewAssignmentSubmissionSentence =
  typeof assignmentSubmissionSentences.$inferInsert;

export type AssignmentCorrection = typeof assignmentCorrections.$inferSelect;
export type NewAssignmentCorrection =
  typeof assignmentCorrections.$inferInsert;

export type AssignmentSubmissionStatus =
  (typeof assignmentSubmissionStatusEnum.enumValues)[number];
export type AssignmentSentenceVerdict =
  (typeof assignmentSentenceVerdictEnum.enumValues)[number];
export type AssignmentTypeKind = (typeof assignmentTypeEnum.enumValues)[number];
