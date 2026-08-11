-- Some legacy production databases were baselined without the prompt tables
-- even though they were present in the original Drizzle migration. Recreate
-- the storage idempotently so prompt management and Lab Assistant guidance
-- work on every environment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prompt_type') THEN
    CREATE TYPE "public"."prompt_type" AS ENUM (
      'grading_text',
      'grading_audio',
      'voice_ai',
      'chatbot'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ai_prompts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "type" "prompt_type" NOT NULL,
  "description" text,
  "current_content" text NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompts_slug_unique"
  ON "ai_prompts" ("slug");

CREATE TABLE IF NOT EXISTS "ai_prompt_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prompt_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "content" text NOT NULL,
  "change_note" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_prompt_versions_prompt_id_idx"
  ON "ai_prompt_versions" ("prompt_id");

CREATE INDEX IF NOT EXISTS "ai_prompt_versions_created_by_idx"
  ON "ai_prompt_versions" ("created_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_prompt_versions_prompt_id_ai_prompts_id_fk'
  ) THEN
    ALTER TABLE "ai_prompt_versions"
      ADD CONSTRAINT "ai_prompt_versions_prompt_id_ai_prompts_id_fk"
      FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_prompt_versions_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "ai_prompt_versions"
      ADD CONSTRAINT "ai_prompt_versions_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
  END IF;
END $$;
