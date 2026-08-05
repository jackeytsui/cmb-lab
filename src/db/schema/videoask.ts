import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
} from "./course-library";
import { users } from "./users";
import { videoThreadSteps, videoThreads } from "./video-threads";
import { videoUploads } from "./uploads";

/**
 * The single VideoAsk organization connected to CMB Lab.
 *
 * OAuth credentials are encrypted with AES-256-GCM before they reach Neon.
 * The fixed primary key makes reconnecting an atomic upsert instead of creating
 * a trail of stale credentials.
 */
export const videoaskIntegration = pgTable(
  "videoask_integration",
  {
    id: text("id").primaryKey().default("primary"),
    organizationId: text("organization_id").notNull(),
    organizationName: text("organization_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
    scope: text("scope"),
    connectedBy: uuid("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    lastValidatedAt: timestamp("last_validated_at").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("videoask_integration_organization_idx").on(table.organizationId),
  ],
);

export type VideoAskIntegration = typeof videoaskIntegration.$inferSelect;

/** Durable record of each source inventory scan. */
export const videoaskInventoryScans = pgTable(
  "videoask_inventory_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    status: text("status").notNull().default("scanning"),
    formCount: integer("form_count").notNull().default(0),
    lastError: text("last_error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("videoask_inventory_scans_organization_idx").on(
      table.organizationId,
    ),
    index("videoask_inventory_scans_status_idx").on(table.status),
  ],
);

/** Latest known VideoAsk form summaries, keyed by organization + form. */
export const videoaskInventoryForms = pgTable(
  "videoask_inventory_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    sourceFormId: text("source_form_id").notNull(),
    title: text("title").notNull(),
    folderId: text("folder_id"),
    folderName: text("folder_name"),
    shareUrl: text("share_url"),
    sourceCreatedAt: timestamp("source_created_at"),
    sourceUpdatedAt: timestamp("source_updated_at"),
    lastScanId: uuid("last_scan_id")
      .notNull()
      .references(() => videoaskInventoryScans.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_inventory_forms_organization_form_unique").on(
      table.organizationId,
      table.sourceFormId,
    ),
    index("videoask_inventory_forms_scan_idx").on(table.lastScanId),
  ],
);

/** One source-staging project per connected VideoAsk organization. */
export const videoaskImportProjects = pgTable(
  "videoask_import_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    // Legacy imports used a generated draft Course Library course. New source
    // staging is deliberately course-independent; this nullable reference only
    // remains so migration 0078 can retire old generated courses safely.
    courseId: uuid("course_id").references(() => courseLibraryCourses.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_import_projects_organization_unique").on(
      table.organizationId,
    ),
    uniqueIndex("videoask_import_projects_course_unique").on(table.courseId),
  ],
);

/** Legacy folder-to-module map retained for migration/audit compatibility. */
export const videoaskImportModules = pgTable(
  "videoask_import_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => videoaskImportProjects.id, { onDelete: "cascade" }),
    sourceFolderKey: text("source_folder_key").notNull(),
    sourceFolderId: text("source_folder_id"),
    sourceFolderName: text("source_folder_name"),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseLibraryModules.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("videoask_import_modules_project_folder_unique").on(
      table.projectId,
      table.sourceFolderKey,
    ),
    uniqueIndex("videoask_import_modules_module_unique").on(table.moduleId),
  ],
);

/** Durable, duplicate-safe import record for a single VideoAsk form. */
export const videoaskFormImports = pgTable(
  "videoask_form_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => videoaskImportProjects.id, { onDelete: "cascade" }),
    sourceFormId: text("source_form_id").notNull(),
    sourceFormTitle: text("source_form_title").notNull(),
    sourceFolderKey: text("source_folder_key").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at"),
    status: text("status").notNull().default("pending"),
    threadId: uuid("thread_id").references(() => videoThreads.id, {
      onDelete: "set null",
    }),
    lessonId: uuid("lesson_id").references(() => courseLibraryLessons.id, {
      onDelete: "set null",
    }),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    stats: jsonb("stats")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastError: text("last_error"),
    importedBy: uuid("imported_by").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_form_imports_project_form_unique").on(
      table.projectId,
      table.sourceFormId,
    ),
    index("videoask_form_imports_status_idx").on(table.status),
    index("videoask_form_imports_thread_idx").on(table.threadId),
    index("videoask_form_imports_lesson_idx").on(table.lessonId),
  ],
);

/** Source-to-destination step mapping and immutable source snapshot. */
export const videoaskStepImports = pgTable(
  "videoask_step_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formImportId: uuid("form_import_id")
      .notNull()
      .references(() => videoaskFormImports.id, { onDelete: "cascade" }),
    sourceQuestionId: text("source_question_id").notNull(),
    sourceMediaId: text("source_media_id"),
    mediaImportId: uuid("media_import_id").references(
      () => videoaskMediaImports.id,
      { onDelete: "set null" },
    ),
    // Legacy imports created a native video-thread step. Source staging now
    // keeps the normalized fields directly and has no Course Library/thread
    // destination until an administrator publishes a Vocal Hack placement.
    stepId: uuid("step_id").references(() => videoThreadSteps.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    sourcePromptText: text("source_prompt_text"),
    sourceTranscript: text("source_transcript"),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("videoask_step_imports_form_question_unique").on(
      table.formImportId,
      table.sourceQuestionId,
    ),
    uniqueIndex("videoask_step_imports_step_unique").on(table.stepId),
  ],
);

/** Dedupe map for VideoAsk media copied into CMB Lab-owned storage. */
export const videoaskMediaImports = pgTable(
  "videoask_media_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    sourceMediaKey: text("source_media_key").notNull(),
    sourceMediaId: text("source_media_id"),
    sourceUrl: text("source_url").notNull(),
    storageProvider: text("storage_provider"),
    destinationUrl: text("destination_url"),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    videoUploadId: uuid("video_upload_id").references(() => videoUploads.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_media_imports_organization_media_unique").on(
      table.organizationId,
      table.sourceMediaKey,
    ),
    index("videoask_media_imports_video_upload_idx").on(table.videoUploadId),
    index("videoask_media_imports_status_idx").on(table.status),
  ],
);

/**
 * Review-gated conversion of one imported VideoAsk form into a native Vocal
 * Hack lesson inside an existing Course Library module. The destination lesson
 * is not changed until the placement has complete sentence drafts and an admin
 * explicitly publishes it.
 */
export const videoaskVocalHackPlacements = pgTable(
  "videoask_vocal_hack_placements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formImportId: uuid("form_import_id")
      .notNull()
      .references(() => videoaskFormImports.id, { onDelete: "cascade" }),
    sourceGroup: text("source_group").notNull(),
    language: text("language").notNull(),
    targetCourseId: uuid("target_course_id").references(
      () => courseLibraryCourses.id,
      { onDelete: "set null" },
    ),
    targetModuleId: uuid("target_module_id").references(
      () => courseLibraryModules.id,
      { onDelete: "set null" },
    ),
    targetLessonId: uuid("target_lesson_id").references(
      () => courseLibraryLessons.id,
      { onDelete: "set null" },
    ),
    publishedLessonId: uuid("published_lesson_id").references(
      () => courseLibraryLessons.id,
      { onDelete: "set null" },
    ),
    targetLessonTitle: text("target_lesson_title"),
    action: text("action").notNull(),
    confidence: text("confidence").notNull(),
    matchScore: integer("match_score").notNull().default(0),
    mappingReason: text("mapping_reason").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("planned"),
    totalSentences: integer("total_sentences").notNull().default(0),
    readySentences: integer("ready_sentences").notNull().default(0),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    publishedAt: timestamp("published_at"),
    destinationSnapshot: jsonb("destination_snapshot").$type<
      Record<string, unknown>
    >(),
    rolledBackBy: uuid("rolled_back_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rolledBackAt: timestamp("rolled_back_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_vocal_hack_placements_form_unique").on(
      table.formImportId,
    ),
    index("videoask_vocal_hack_placements_status_idx").on(table.status),
    index("videoask_vocal_hack_placements_module_idx").on(
      table.targetModuleId,
    ),
  ],
);

/** One staged sentence/video inside a review-gated Vocal Hack placement. */
export const videoaskVocalHackSentences = pgTable(
  "videoask_vocal_hack_sentences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placementId: uuid("placement_id")
      .notNull()
      .references(() => videoaskVocalHackPlacements.id, {
        onDelete: "cascade",
      }),
    stepImportId: uuid("step_import_id")
      .notNull()
      .references(() => videoaskStepImports.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    videoUrl: text("video_url").notNull(),
    sourcePromptText: text("source_prompt_text"),
    sourceTranscript: text("source_transcript"),
    aiTranscript: text("ai_transcript"),
    chinese: text("chinese"),
    pinyin: text("pinyin"),
    english: text("english"),
    status: text("status").notNull().default("held"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    transcribedAt: timestamp("transcribed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("videoask_vocal_hack_sentences_step_unique").on(
      table.stepImportId,
    ),
    index("videoask_vocal_hack_sentences_order_idx").on(
      table.placementId,
      table.sortOrder,
    ),
    index("videoask_vocal_hack_sentences_status_idx").on(table.status),
    index("videoask_vocal_hack_sentences_placement_idx").on(
      table.placementId,
    ),
  ],
);

export type VideoAskImportProject = typeof videoaskImportProjects.$inferSelect;
export type VideoAskInventoryScan = typeof videoaskInventoryScans.$inferSelect;
export type VideoAskInventoryForm = typeof videoaskInventoryForms.$inferSelect;
export type VideoAskFormImport = typeof videoaskFormImports.$inferSelect;
export type VideoAskStepImport = typeof videoaskStepImports.$inferSelect;
export type VideoAskMediaImport = typeof videoaskMediaImports.$inferSelect;
export type VideoAskVocalHackPlacement =
  typeof videoaskVocalHackPlacements.$inferSelect;
export type VideoAskVocalHackSentence =
  typeof videoaskVocalHackSentences.$inferSelect;
