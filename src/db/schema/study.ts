import {
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const studyPreferences = pgTable(
  "study_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyMinutes: integer("daily_minutes").notNull().default(30),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("study_preferences_daily_minutes_idx").on(table.dailyMinutes)]
);
