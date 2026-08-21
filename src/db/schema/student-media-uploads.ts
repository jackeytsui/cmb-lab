import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Private student audio/video uploads referenced by practice and submissions. */
export const studentMediaUploads = pgTable(
  "student_media_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("student_media_uploads_user_idx").on(table.userId)],
);

export type StudentMediaUpload = typeof studentMediaUploads.$inferSelect;
