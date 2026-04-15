import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Per-user notepad state for /dashboard/notepad. One row per (user, pane).
 * Saves the last-committed text + script mode + font size so when a student
 * returns to the notepad, their draft is still there.
 */
export const notepadEntries = pgTable(
  "notepad_entries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pane: text("pane").notNull(), // 'mandarin' | 'cantonese'
    text: text("text").notNull().default(""),
    scriptMode: text("script_mode").notNull().default("simplified"), // 'simplified' | 'traditional'
    fontSize: integer("font_size").notNull().default(32),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pane] })],
);

export type NotepadEntry = typeof notepadEntries.$inferSelect;
export type NewNotepadEntry = typeof notepadEntries.$inferInsert;

/**
 * Saved notes inside a user's Notepad. Each Enter commits one note.
 * Modeled on coaching sessionNotes but lives outside of any session.
 */
export const notepadNotes = pgTable("notepad_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pane: text("pane").notNull(), // 'mandarin' | 'cantonese'
  text: text("text").notNull(), // committed Traditional Chinese source
  order: integer("order").notNull().default(0),
  starred: integer("starred").notNull().default(0), // 0/1
  textOverride: text("text_override"),
  romanizationOverride: text("romanization_override"),
  translationOverride: text("translation_override"),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type NotepadNote = typeof notepadNotes.$inferSelect;
export type NewNotepadNote = typeof notepadNotes.$inferInsert;
