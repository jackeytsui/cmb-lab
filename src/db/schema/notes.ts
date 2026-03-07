import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { submissions } from "./submissions";

// Note visibility enum
export const noteVisibilityEnum = pgEnum("note_visibility", [
  "internal", // Coach only
  "shared", // Student can see
]);

// Coach notes table - internal or shared notes about students
export const coachNotes = pgTable("coach_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").references(() => submissions.id, {
    onDelete: "cascade",
  }), // Optional link to specific submission
  visibility: noteVisibilityEnum("visibility").notNull().default("internal"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("coach_notes_coach_id_idx").on(table.coachId),
  index("coach_notes_student_id_idx").on(table.studentId),
  index("coach_notes_submission_id_idx").on(table.submissionId),
]);

// Relations: CoachNote belongs to Coach user, Student user, optionally Submission
export const coachNotesRelations = relations(coachNotes, ({ one }) => ({
  coach: one(users, {
    fields: [coachNotes.coachId],
    references: [users.id],
    relationName: "coach",
  }),
  student: one(users, {
    fields: [coachNotes.studentId],
    references: [users.id],
    relationName: "student",
  }),
  submission: one(submissions, {
    fields: [coachNotes.submissionId],
    references: [submissions.id],
  }),
}));

// Type inference
export type CoachNote = typeof coachNotes.$inferSelect;
export type NewCoachNote = typeof coachNotes.$inferInsert;
