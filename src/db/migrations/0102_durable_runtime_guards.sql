-- Correctness and abuse-protection fallbacks for environments without
-- Upstash. Both tables hold short-lived data and are pruned as they are used.
CREATE TABLE IF NOT EXISTS "ghl_echo_markers" (
  "key" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ghl_echo_markers_expires_at_idx"
  ON "ghl_echo_markers" ("expires_at");

CREATE TABLE IF NOT EXISTS "api_rate_limit_windows" (
  "key" text PRIMARY KEY NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "api_rate_limit_windows_expires_at_idx"
  ON "api_rate_limit_windows" ("expires_at");
