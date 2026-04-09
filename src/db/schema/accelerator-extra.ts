import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ---------------------------------------------------------------------------
// Tone Mastery — video clips with self-rating
// ---------------------------------------------------------------------------

export const toneMasteryClips = pgTable(
  "tone_mastery_clips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    pinyin: text("pinyin").notNull(),
    chinese: text("chinese").notNull(),
    videoUrl: text("video_url").notNull(),
    groupNumber: integer("group_number").notNull(),
    itemNumber: integer("item_number").notNull(),
    variant: text("variant").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tone_mastery_clips_group_idx").on(table.groupNumber),
    index("tone_mastery_clips_sort_idx").on(table.sortOrder),
  ],
);

export const toneMasteryProgress = pgTable(
  "tone_mastery_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => toneMasteryClips.id, { onDelete: "cascade" }),
    selfRating: text("self_rating").notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tone_mastery_progress_user_clip_idx").on(
      table.userId,
      table.clipId,
    ),
    index("tone_mastery_progress_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Listening Training — multiple-choice questions
// ---------------------------------------------------------------------------

export const listeningQuestions = pgTable(
  "listening_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sortOrder: integer("sort_order").notNull().default(0),
    chineseText: text("chinese_text").notNull(),
    englishText: text("english_text").notNull().default(""),
    correctPinyin: text("correct_pinyin").notNull(),
    wrongPinyin1: text("wrong_pinyin1").notNull(),
    wrongPinyin2: text("wrong_pinyin2").notNull(),
    wrongPinyin3: text("wrong_pinyin3").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("listening_questions_sort_idx").on(table.sortOrder)],
);

export const listeningProgress = pgTable(
  "listening_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => listeningQuestions.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("listening_progress_user_question_idx").on(
      table.userId,
      table.questionId,
    ),
    index("listening_progress_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const toneMasteryClipsRelations = relations(
  toneMasteryClips,
  ({ many }) => ({
    progress: many(toneMasteryProgress),
  }),
);

export const toneMasteryProgressRelations = relations(
  toneMasteryProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [toneMasteryProgress.userId],
      references: [users.id],
    }),
    clip: one(toneMasteryClips, {
      fields: [toneMasteryProgress.clipId],
      references: [toneMasteryClips.id],
    }),
  }),
);

export const listeningQuestionsRelations = relations(
  listeningQuestions,
  ({ many }) => ({
    progress: many(listeningProgress),
  }),
);

export const listeningProgressRelations = relations(
  listeningProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [listeningProgress.userId],
      references: [users.id],
    }),
    question: one(listeningQuestions, {
      fields: [listeningProgress.questionId],
      references: [listeningQuestions.id],
    }),
  }),
);
