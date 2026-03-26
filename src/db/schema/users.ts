import { pgTable, uuid, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Role enum: student < coach < admin (hierarchical)
export const roleEnum = pgEnum("role", ["student", "coach", "admin"]);

// Language preference enum
export const languagePreferenceEnum = pgEnum("language_preference", [
  "cantonese",
  "mandarin",
  "both",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  imageUrl: text("image_url"),
  role: roleEnum("role").notNull().default("student"),
  languagePreference: languagePreferenceEnum("language_preference")
    .notNull()
    .default("both"),
  dailyGoalXp: integer("daily_goal_xp").notNull().default(100),
  timezone: text("timezone").notNull().default("UTC"),
  longestStreak: integer("longest_streak").notNull().default(0),
  showCohortRankings: boolean("show_cohort_rankings").notNull().default(false),
  assignedCoachId: uuid("assigned_coach_id"),
  coachingGoals: text("coaching_goals"),
  coachingLevel: text("coaching_level"), // "CMB Foundation" | "CMB Intermediate" | "CMB Advanced"
  coachingLessonNumber: text("coaching_lesson_number"), // e.g. "Lesson 5" or "Chapter 3"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

export const usersRelations = relations(users, ({ one }) => ({
  assignedCoach: one(users, {
    fields: [users.assignedCoachId],
    references: [users.id],
    relationName: "assignedCoach",
  }),
}));

// Type inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
