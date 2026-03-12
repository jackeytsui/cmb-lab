CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" varchar(100) PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed default transcript limit: 5 per week for students
INSERT INTO "app_settings" ("key", "value", "description")
VALUES
  ('transcript_limit_count', '5', 'Maximum number of YouTube transcriptions per student per period'),
  ('transcript_limit_period', 'weekly', 'Period for transcript limit: daily, weekly, or monthly')
ON CONFLICT ("key") DO NOTHING;
