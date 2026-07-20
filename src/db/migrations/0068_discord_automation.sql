-- Discord student automation: account links, tag -> role mappings, audit log.
-- Membership and roles in the Discord community become a projection of LMS
-- tags (which already sync bidirectionally with GoHighLevel), so purchases,
-- completions, and expirations flow through to Discord with zero manual work.
-- Idempotent: IF NOT EXISTS guards throughout.

CREATE TABLE IF NOT EXISTS "discord_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "discord_user_id" text NOT NULL,
  "discord_username" text,
  "discord_avatar" text,
  "guild_status" text NOT NULL DEFAULT 'pending',
  "guild_joined_at" timestamp,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "last_synced_at" timestamp,
  "last_sync_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "discord_connections_user_unique"
  ON "discord_connections" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "discord_connections_discord_user_unique"
  ON "discord_connections" ("discord_user_id");

CREATE TABLE IF NOT EXISTS "discord_role_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "discord_role_id" text NOT NULL,
  "discord_role_name" text,
  "grants_membership" boolean NOT NULL DEFAULT true,
  "private_channel_id" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "discord_role_mappings_tag_role_unique"
  ON "discord_role_mappings" ("tag_id", "discord_role_id");
CREATE INDEX IF NOT EXISTS "discord_role_mappings_tag_id_idx"
  ON "discord_role_mappings" ("tag_id");

CREATE TABLE IF NOT EXISTS "discord_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "discord_user_id" text,
  "action" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success',
  "detail" jsonb NOT NULL DEFAULT '{}',
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "discord_audit_log_user_id_idx"
  ON "discord_audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "discord_audit_log_created_at_idx"
  ON "discord_audit_log" ("created_at");
