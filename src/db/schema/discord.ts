import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tags } from "./tags";

// --- Tables ---

// Discord Connections: links an LMS user to their Discord account.
// OAuth tokens are kept so the bot can (re)join the member to the guild
// server-side whenever their access changes — no manual invites.
export const discordConnections = pgTable(
  "discord_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    discordUsername: text("discord_username"),
    discordAvatar: text("discord_avatar"),
    // "pending" (linked, not yet in guild) | "joined" | "left" | "removed"
    guildStatus: text("guild_status").notNull().default("pending"),
    guildJoinedAt: timestamp("guild_joined_at"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("discord_connections_user_unique").on(table.userId),
    uniqueIndex("discord_connections_discord_user_unique").on(
      table.discordUserId
    ),
  ]
);

// Discord Role Mappings: LMS tag -> Discord role. The sync engine grants the
// Discord role while the student has the tag and removes it when the tag goes
// away. grantsMembership mappings also entitle the student to be in the guild
// at all — a student with zero grantsMembership tags is kicked or stripped
// per the removal policy.
export const discordRoleMappings = pgTable(
  "discord_role_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    discordRoleId: text("discord_role_id").notNull(),
    discordRoleName: text("discord_role_name"), // cached display name
    grantsMembership: boolean("grants_membership").notNull().default(true),
    privateChannelId: text("private_channel_id"), // role-gated channel, if provisioned
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("discord_role_mappings_tag_role_unique").on(
      table.tagId,
      table.discordRoleId
    ),
    index("discord_role_mappings_tag_id_idx").on(table.tagId),
  ]
);

// Discord Audit Log: every action the automation takes against Discord
// (join, role add/remove, kick, channel/role provisioning) with outcome.
export const discordAuditLog = pgTable(
  "discord_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    discordUserId: text("discord_user_id"),
    action: text("action").notNull(), // e.g. "guild.join", "role.add", "member.kick"
    status: text("status").notNull().default("success"), // "success" | "error" | "skipped"
    detail: jsonb("detail").notNull().default({}),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("discord_audit_log_user_id_idx").on(table.userId),
    index("discord_audit_log_created_at_idx").on(table.createdAt),
  ]
);

// --- Relations ---

export const discordConnectionsRelations = relations(
  discordConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [discordConnections.userId],
      references: [users.id],
    }),
  })
);

export const discordRoleMappingsRelations = relations(
  discordRoleMappings,
  ({ one }) => ({
    tag: one(tags, {
      fields: [discordRoleMappings.tagId],
      references: [tags.id],
    }),
    createdByUser: one(users, {
      fields: [discordRoleMappings.createdBy],
      references: [users.id],
    }),
  })
);

// --- Type Inference ---

export type DiscordConnection = typeof discordConnections.$inferSelect;
export type NewDiscordConnection = typeof discordConnections.$inferInsert;

export type DiscordRoleMapping = typeof discordRoleMappings.$inferSelect;
export type NewDiscordRoleMapping = typeof discordRoleMappings.$inferInsert;

export type DiscordAuditLogEntry = typeof discordAuditLog.$inferSelect;
export type NewDiscordAuditLogEntry = typeof discordAuditLog.$inferInsert;
