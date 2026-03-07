import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { assignmentTargetTypeEnum } from "./practice";

// ============================================================
// Enums
// ============================================================

export const captionSourceEnum = pgEnum("caption_source", [
  "youtube_auto",
  "youtube_manual",
  "upload_srt",
  "upload_vtt",
  "whisper_auto",
]);

// ============================================================
// Tables
// ============================================================

// Video listening sessions (one per user + YouTube video combination)
export const videoSessions = pgTable(
  "video_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
    youtubeUrl: text("youtube_url").notNull(),
    title: text("title"), // nullable, populated when metadata fetched
    captionSource: captionSourceEnum("caption_source"), // set when captions loaded
    captionLang: varchar("caption_lang", { length: 10 }), // e.g. "zh-Hans"
    captionCount: integer("caption_count").notNull().default(0),
    lastPositionMs: integer("last_position_ms").notNull().default(0),
    videoDurationMs: integer("video_duration_ms"), // null until first play event
    totalWatchedMs: integer("total_watched_ms").notNull().default(0),
    completionPercent: integer("completion_percent").notNull().default(0), // 0-100
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("video_sessions_user_id_idx").on(table.userId),
    index("video_sessions_youtube_video_id_idx").on(table.youtubeVideoId),
    unique("video_sessions_user_video_unique").on(
      table.userId,
      table.youtubeVideoId
    ),
  ]
);

// Individual caption lines for a video session
export const videoCaptions = pgTable(
  "video_captions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoSessionId: uuid("video_session_id")
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    startMs: integer("start_ms").notNull(), // start time in milliseconds
    endMs: integer("end_ms").notNull(), // end time in milliseconds
    text: text("text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("video_captions_session_idx").on(table.videoSessionId),
    index("video_captions_session_seq_idx").on(
      table.videoSessionId,
      table.sequence
    ),
  ]
);

// Vocabulary encounters during video sessions (one per word per session)
export const videoVocabEncounters = pgTable(
  "video_vocab_encounters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoSessionId: uuid("video_session_id")
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    word: varchar("word", { length: 50 }).notNull(),
    positionMs: integer("position_ms"), // nullable -- video position when encountered
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("video_vocab_encounters_session_idx").on(table.videoSessionId),
    unique("video_vocab_encounters_session_word").on(
      table.videoSessionId,
      table.word
    ),
  ]
);

// Video assignments — coach assigns YouTube videos to students/groups
export const videoAssignments = pgTable(
  "video_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    youtubeUrl: text("youtube_url").notNull(),
    youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
    title: text("title"), // Optional coach-provided title
    notes: text("notes"), // Optional coach notes/instructions
    targetType: assignmentTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("video_assignments_assigned_by_idx").on(table.assignedBy),
    index("video_assignments_youtube_video_id_idx").on(table.youtubeVideoId),
    unique("video_assignments_video_target_unique").on(
      table.youtubeVideoId,
      table.targetType,
      table.targetId
    ),
  ]
);

// ============================================================
// Relations
// ============================================================

export const videoSessionsRelations = relations(
  videoSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [videoSessions.userId],
      references: [users.id],
    }),
    captions: many(videoCaptions),
    vocabEncounters: many(videoVocabEncounters),
  })
);

export const videoCaptionsRelations = relations(
  videoCaptions,
  ({ one }) => ({
    videoSession: one(videoSessions, {
      fields: [videoCaptions.videoSessionId],
      references: [videoSessions.id],
    }),
  })
);

export const videoVocabEncountersRelations = relations(
  videoVocabEncounters,
  ({ one }) => ({
    videoSession: one(videoSessions, {
      fields: [videoVocabEncounters.videoSessionId],
      references: [videoSessions.id],
    }),
  })
);

export const videoAssignmentsRelations = relations(
  videoAssignments,
  ({ one }) => ({
    assignedByUser: one(users, {
      fields: [videoAssignments.assignedBy],
      references: [users.id],
    }),
  })
);

// ============================================================
// Type Inference
// ============================================================

export type VideoSession = typeof videoSessions.$inferSelect;
export type NewVideoSession = typeof videoSessions.$inferInsert;
export type VideoCaption = typeof videoCaptions.$inferSelect;
export type NewVideoCaption = typeof videoCaptions.$inferInsert;
export type VideoVocabEncounter = typeof videoVocabEncounters.$inferSelect;
export type NewVideoVocabEncounter = typeof videoVocabEncounters.$inferInsert;
export type VideoAssignment = typeof videoAssignments.$inferSelect;
export type NewVideoAssignment = typeof videoAssignments.$inferInsert;
