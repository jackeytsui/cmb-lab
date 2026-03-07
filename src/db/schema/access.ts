import { pgTable, uuid, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";

// Access tier enum
export const accessTierEnum = pgEnum("access_tier", ["preview", "full"]);

// Granted by source enum
export const grantedByEnum = pgEnum("granted_by", [
  "webhook",
  "coach",
  "admin",
]);

// Course access grants - links users to courses with permissions
export const courseAccess = pgTable("course_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  accessTier: accessTierEnum("access_tier").notNull().default("full"),
  expiresAt: timestamp("expires_at"), // null = lifetime access
  grantedBy: grantedByEnum("granted_by").notNull().default("webhook"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("course_access_user_id_idx").on(table.userId),
  index("course_access_course_id_idx").on(table.courseId),
]);

// Relations: CourseAccess belongs to User and Course
export const courseAccessRelations = relations(courseAccess, ({ one }) => ({
  user: one(users, {
    fields: [courseAccess.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [courseAccess.courseId],
    references: [courses.id],
  }),
}));

// Type inference
export type CourseAccess = typeof courseAccess.$inferSelect;
export type NewCourseAccess = typeof courseAccess.$inferInsert;
