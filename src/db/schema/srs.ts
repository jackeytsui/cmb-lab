import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const srsCardStateEnum = pgEnum("srs_card_state", [
  "new",
  "learning",
  "review",
  "relearning",
]);

export const srsCardSourceEnum = pgEnum("srs_card_source", [
  "manual",
  "vocabulary",
  "reader",
  "practice",
  "grammar",
  "assessment",
]);

export const srsRatingEnum = pgEnum("srs_rating", [
  "again",
  "hard",
  "good",
  "easy",
]);

export const srsDecks = pgTable(
  "srs_decks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("srs_decks_user_id_idx").on(table.userId),
  ]
);

export const srsCards = pgTable(
  "srs_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckId: uuid("deck_id").references(() => srsDecks.id, {
      onDelete: "set null",
    }),
    sourceType: srsCardSourceEnum("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    traditional: text("traditional").notNull(),
    simplified: text("simplified"),
    pinyin: text("pinyin"),
    jyutping: text("jyutping"),
    meaning: text("meaning").notNull(),
    example: text("example"),
    state: srsCardStateEnum("state").notNull().default("new"),
    due: timestamp("due").notNull().defaultNow(),
    stability: real("stability").notNull().default(0.3),
    difficulty: real("difficulty").notNull().default(5),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    lastReviewAt: timestamp("last_review_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("srs_cards_user_id_idx").on(table.userId),
    index("srs_cards_due_idx").on(table.due),
    index("srs_cards_deck_id_idx").on(table.deckId),
  ]
);

export const srsReviews = pgTable(
  "srs_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => srsCards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: srsRatingEnum("rating").notNull(),
    stateBefore: srsCardStateEnum("state_before").notNull(),
    stateAfter: srsCardStateEnum("state_after").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  },
  (table) => [
    index("srs_reviews_card_id_idx").on(table.cardId),
    index("srs_reviews_user_id_idx").on(table.userId),
    index("srs_reviews_reviewed_at_idx").on(table.reviewedAt),
  ]
);

export const srsDecksRelations = relations(srsDecks, ({ one, many }) => ({
  user: one(users, {
    fields: [srsDecks.userId],
    references: [users.id],
  }),
  cards: many(srsCards),
}));

export const srsCardsRelations = relations(srsCards, ({ one, many }) => ({
  user: one(users, {
    fields: [srsCards.userId],
    references: [users.id],
  }),
  deck: one(srsDecks, {
    fields: [srsCards.deckId],
    references: [srsDecks.id],
  }),
  reviews: many(srsReviews),
}));

export const srsReviewsRelations = relations(srsReviews, ({ one }) => ({
  card: one(srsCards, {
    fields: [srsReviews.cardId],
    references: [srsCards.id],
  }),
  user: one(users, {
    fields: [srsReviews.userId],
    references: [users.id],
  }),
}));

export type SrsDeck = typeof srsDecks.$inferSelect;
export type NewSrsDeck = typeof srsDecks.$inferInsert;

export type SrsCard = typeof srsCards.$inferSelect;
export type NewSrsCard = typeof srsCards.$inferInsert;

export type SrsReview = typeof srsReviews.$inferSelect;
export type NewSrsReview = typeof srsReviews.$inferInsert;

export type SrsCardState = (typeof srsCardStateEnum.enumValues)[number];
export type SrsRating = (typeof srsRatingEnum.enumValues)[number];
