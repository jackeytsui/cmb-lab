import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Platform Role Features: feature flags for platform-level roles (student, coach, admin)
export const platformRoleFeatures = pgTable(
  "platform_role_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: text("role").notNull(), // "student" | "coach" | "admin"
    featureKey: text("feature_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("platform_role_features_role_feature_unique").on(
      table.role,
      table.featureKey
    ),
    index("platform_role_features_role_idx").on(table.role),
  ]
);

// Type inference
export type PlatformRoleFeature = typeof platformRoleFeatures.$inferSelect;
export type NewPlatformRoleFeature = typeof platformRoleFeatures.$inferInsert;
