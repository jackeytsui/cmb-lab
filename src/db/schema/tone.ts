import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const toneLanguageEnum = pgEnum("tone_language", [
  "mandarin",
  "cantonese",
]);

export const toneAttemptTypeEnum = pgEnum("tone_attempt_type", [
  "identification",
  "production",
  "minimal_pair",
  "sandhi",
]);

export const tonePracticeAttempts = pgTable(
  "tone_practice_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: toneLanguageEnum("language").notNull(),
    type: toneAttemptTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    expectedTone: integer("expected_tone"),
    selectedTone: integer("selected_tone"),
    isCorrect: integer("is_correct").notNull().default(0),
    score: real("score").notNull().default(0),
    feedback: text("feedback"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("tone_practice_attempts_user_id_idx").on(table.userId),
    index("tone_practice_attempts_created_at_idx").on(table.createdAt),
  ]
);

export type TonePracticeAttempt = typeof tonePracticeAttempts.$inferSelect;
