import { pgTable, uuid, text, timestamp, varchar, index, uniqueIndex, integer, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";

export const listeningRecommendations = pgTable(
  "listening_recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    youtubeUrl: text("youtube_url").notNull(),
    youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
    videoTitle: text("video_title").notNull(),
    channelName: text("channel_name").notNull(),
    thumbnailUrl: text("thumbnail_url").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("listening_recommendations_video_id_unique").on(table.youtubeVideoId),
    index("listening_recommendations_created_at_idx").on(table.createdAt),
  ],
);

export type ListeningRecommendation = typeof listeningRecommendations.$inferSelect;
export type NewListeningRecommendation = typeof listeningRecommendations.$inferInsert;
