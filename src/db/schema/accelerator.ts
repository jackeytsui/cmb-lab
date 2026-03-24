import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const typingLanguageEnum = pgEnum("typing_language", [
  "mandarin",
  "cantonese",
]);

// ---------------------------------------------------------------------------
// Typing Unlock Kit
// ---------------------------------------------------------------------------

export const typingSentences = pgTable(
  "typing_sentences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    language: typingLanguageEnum("language").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    chineseText: text("chinese_text").notNull(),
    englishText: text("english_text").notNull(),
    romanisation: text("romanisation").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("typing_sentences_language_idx").on(table.language),
    index("typing_sentences_sort_order_idx").on(table.sortOrder),
  ]
);

export const typingProgress = pgTable(
  "typing_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => typingSentences.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("typing_progress_user_sentence_unique").on(
      table.userId,
      table.sentenceId
    ),
    index("typing_progress_user_id_idx").on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// Conversation Scripts
// ---------------------------------------------------------------------------

export const conversationScripts = pgTable("conversation_scripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  speakerRole: text("speaker_role").notNull(),
  responderRole: text("responder_role").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const scriptLines = pgTable(
  "script_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => conversationScripts.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    role: text("role").notNull(),
    cantoneseText: text("cantonese_text").notNull(),
    mandarinText: text("mandarin_text").notNull(),
    cantoneseRomanisation: text("cantonese_romanisation").notNull(),
    mandarinRomanisation: text("mandarin_romanisation").notNull(),
    englishText: text("english_text").notNull(),
    cantoneseAudioUrl: text("cantonese_audio_url"),
    mandarinAudioUrl: text("mandarin_audio_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("script_lines_script_id_idx").on(table.scriptId),
    index("script_lines_sort_order_idx").on(table.sortOrder),
  ]
);

export const scriptLineProgress = pgTable(
  "script_line_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => scriptLines.id, { onDelete: "cascade" }),
    selfRating: text("self_rating").notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("script_line_progress_user_line_unique").on(
      table.userId,
      table.lineId
    ),
    index("script_line_progress_user_id_idx").on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// Curated Passages (AI Reader)
// ---------------------------------------------------------------------------

export const curatedPassages = pgTable("curated_passages", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const passageReadStatus = pgTable(
  "passage_read_status",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => curatedPassages.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("passage_read_status_user_passage_unique").on(
      table.userId,
      table.passageId
    ),
    index("passage_read_status_user_id_idx").on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const typingSentencesRelations = relations(
  typingSentences,
  ({ many }) => ({
    progress: many(typingProgress),
  })
);

export const typingProgressRelations = relations(
  typingProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [typingProgress.userId],
      references: [users.id],
    }),
    sentence: one(typingSentences, {
      fields: [typingProgress.sentenceId],
      references: [typingSentences.id],
    }),
  })
);

export const conversationScriptsRelations = relations(
  conversationScripts,
  ({ many }) => ({
    lines: many(scriptLines),
  })
);

export const scriptLinesRelations = relations(scriptLines, ({ one, many }) => ({
  script: one(conversationScripts, {
    fields: [scriptLines.scriptId],
    references: [conversationScripts.id],
  }),
  progress: many(scriptLineProgress),
}));

export const scriptLineProgressRelations = relations(
  scriptLineProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [scriptLineProgress.userId],
      references: [users.id],
    }),
    line: one(scriptLines, {
      fields: [scriptLineProgress.lineId],
      references: [scriptLines.id],
    }),
  })
);

export const curatedPassagesRelations = relations(
  curatedPassages,
  ({ many }) => ({
    readStatuses: many(passageReadStatus),
  })
);

export const passageReadStatusRelations = relations(
  passageReadStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [passageReadStatus.userId],
      references: [users.id],
    }),
    passage: one(curatedPassages, {
      fields: [passageReadStatus.passageId],
      references: [curatedPassages.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// Type Inference
// ---------------------------------------------------------------------------

export type TypingSentence = typeof typingSentences.$inferSelect;
export type NewTypingSentence = typeof typingSentences.$inferInsert;

export type TypingProgress = typeof typingProgress.$inferSelect;
export type NewTypingProgress = typeof typingProgress.$inferInsert;

export type ConversationScript = typeof conversationScripts.$inferSelect;
export type NewConversationScript = typeof conversationScripts.$inferInsert;

export type ScriptLine = typeof scriptLines.$inferSelect;
export type NewScriptLine = typeof scriptLines.$inferInsert;

export type ScriptLineProgress = typeof scriptLineProgress.$inferSelect;
export type NewScriptLineProgress = typeof scriptLineProgress.$inferInsert;

export type CuratedPassage = typeof curatedPassages.$inferSelect;
export type NewCuratedPassage = typeof curatedPassages.$inferInsert;

export type PassageReadStatus = typeof passageReadStatus.$inferSelect;
export type NewPassageReadStatus = typeof passageReadStatus.$inferInsert;
