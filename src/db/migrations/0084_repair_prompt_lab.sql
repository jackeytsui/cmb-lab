-- Repair legacy databases that were baselined through migration 0045 even
-- when the Prompt Lab tables from 0024 were absent.
CREATE TABLE IF NOT EXISTS "prompt_lab_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "input" text NOT NULL,
  "expected_pattern" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "prompt_lab_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "prompt_a" text NOT NULL,
  "prompt_b" text,
  "input" text NOT NULL,
  "output_a" text NOT NULL,
  "output_b" text,
  "pass_count" integer DEFAULT 0 NOT NULL,
  "total_cases" integer DEFAULT 0 NOT NULL,
  "meta" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_lab_cases_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "prompt_lab_cases"
      ADD CONSTRAINT "prompt_lab_cases_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_lab_runs_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "prompt_lab_runs"
      ADD CONSTRAINT "prompt_lab_runs_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "prompt_lab_cases_user_id_idx"
  ON "prompt_lab_cases" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "prompt_lab_runs_user_id_idx"
  ON "prompt_lab_runs" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "prompt_lab_runs_created_at_idx"
  ON "prompt_lab_runs" USING btree ("created_at");
