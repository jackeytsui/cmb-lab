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
