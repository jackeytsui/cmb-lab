import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { lessons } from "./courses";

// Upload status enum
export const uploadStatusEnum = pgEnum("upload_status", [
  "pending", // Upload URL generated, waiting for upload
  "uploading", // Client is uploading
  "processing", // Mux is processing
  "ready", // Ready to use
  "errored", // Processing failed
]);

// Upload category enum
export const uploadCategoryEnum = pgEnum("upload_category", [
  "lesson", // Main lesson content
  "prompt", // Coach video prompt
  "other",  // Misc
]);

// Video uploads table - tracks uploaded videos before assignment
export const videoUploads = pgTable("video_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Mux identifiers
  muxUploadId: text("mux_upload_id").notNull().unique(),
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),

  // Upload metadata
  filename: text("filename").notNull(),
  status: uploadStatusEnum("status").notNull().default("pending"),
  category: uploadCategoryEnum("category").notNull().default("lesson"),
  tags: text("tags").array(),
  errorMessage: text("error_message"),

  // Video metadata (from Mux after processing)
  durationSeconds: integer("duration_seconds"),

  // Assignment (null until assigned to a lesson)
  lessonId: uuid("lesson_id").references(() => lessons.id, {
    onDelete: "set null",
  }),

  // Ownership
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.clerkId, { onDelete: "cascade" }),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("video_uploads_lesson_id_idx").on(table.lessonId),
]);

// Types
export type VideoUpload = typeof videoUploads.$inferSelect;
export type NewVideoUpload = typeof videoUploads.$inferInsert;
