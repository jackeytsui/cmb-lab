import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";

// Certificates table - issued when student completes all lessons in a course
export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // Short URL-safe verification ID (nanoid 12 chars)
    verificationId: text("verification_id").notNull().unique(),
    // Snapshot at time of completion (name/title changes don't affect cert)
    studentName: text("student_name").notNull(),
    courseTitle: text("course_title").notNull(),
    // When the course was completed
    completedAt: timestamp("completed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // One certificate per student per course
    unique("certificates_user_course_unique").on(table.userId, table.courseId),
    index("certificates_course_id_idx").on(table.courseId),
  ]
);

// Relations: Certificate belongs to User and Course
export const certificatesRelations = relations(certificates, ({ one }) => ({
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [certificates.courseId],
    references: [courses.id],
  }),
}));

// Type inference
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
