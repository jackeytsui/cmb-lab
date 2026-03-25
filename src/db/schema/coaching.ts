import { pgTable, uuid, text, timestamp, pgEnum, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const coachingSessionTypeEnum = pgEnum("coaching_session_type", [
  "one_on_one",
  "inner_circle",
]);

export const coachingSessions = pgTable(
  "coaching_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: coachingSessionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    studentEmail: text("student_email"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordingUrl: text("recording_url"),
    goals: text("goals"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("coaching_sessions_type_idx").on(table.type),
    index("coaching_sessions_student_email_idx").on(table.studentEmail),
    index("coaching_sessions_created_by_idx").on(table.createdBy),
  ],
);

export const coachingNotes = pgTable(
  "coaching_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => coachingSessions.id, { onDelete: "cascade" }),
    pane: text("pane").notNull(),
    order: integer("order").notNull().default(0),
    text: text("text").notNull(),
    textOverride: text("text_override"),
    romanizationOverride: text("romanization_override"),
    translationOverride: text("translation_override"),
    explanation: text("explanation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("coaching_notes_session_idx").on(table.sessionId),
    index("coaching_notes_order_idx").on(table.order),
  ],
);

export const coachingNoteStars = pgTable(
  "coaching_note_stars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => coachingNotes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("coaching_note_stars_note_idx").on(table.noteId),
    index("coaching_note_stars_user_idx").on(table.userId),
  ],
);

export const coachingSessionsRelations = relations(coachingSessions, ({ one, many }) => ({
  coach: one(users, {
    fields: [coachingSessions.createdBy],
    references: [users.id],
  }),
  notes: many(coachingNotes),
}));

export const coachingNotesRelations = relations(coachingNotes, ({ one }) => ({
  session: one(coachingSessions, {
    fields: [coachingNotes.sessionId],
    references: [coachingSessions.id],
  }),
}));

export const coachingNoteStarsRelations = relations(coachingNoteStars, ({ one }) => ({
  note: one(coachingNotes, {
    fields: [coachingNoteStars.noteId],
    references: [coachingNotes.id],
  }),
  user: one(users, {
    fields: [coachingNoteStars.userId],
    references: [users.id],
  }),
}));

export const coachingSessionRatings = pgTable(
  "coaching_session_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => coachingSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("coaching_session_ratings_session_user_idx").on(
      table.sessionId,
      table.userId,
    ),
    index("coaching_session_ratings_session_idx").on(table.sessionId),
    index("coaching_session_ratings_user_idx").on(table.userId),
  ],
);

export const coachingSessionRatingsRelations = relations(
  coachingSessionRatings,
  ({ one }) => ({
    session: one(coachingSessions, {
      fields: [coachingSessionRatings.sessionId],
      references: [coachingSessions.id],
    }),
    user: one(users, {
      fields: [coachingSessionRatings.userId],
      references: [users.id],
    }),
  }),
);

export type CoachingSession = typeof coachingSessions.$inferSelect;
export type NewCoachingSession = typeof coachingSessions.$inferInsert;
export type CoachingNote = typeof coachingNotes.$inferSelect;
export type NewCoachingNote = typeof coachingNotes.$inferInsert;
export type CoachingSessionRating = typeof coachingSessionRatings.$inferSelect;
export type NewCoachingSessionRating = typeof coachingSessionRatings.$inferInsert;
