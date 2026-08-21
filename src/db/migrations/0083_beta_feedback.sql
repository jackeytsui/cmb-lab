DO $$ BEGIN
  CREATE TYPE "public"."beta_feedback_category" AS ENUM(
    'bug',
    'feature_request',
    'general'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."beta_feedback_status" AS ENUM(
    'new',
    'reviewing',
    'planned',
    'resolved',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "beta_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "category" "beta_feedback_category" NOT NULL,
  "message" text NOT NULL,
  "page_path" text,
  "source" varchar(32) NOT NULL DEFAULT 'chatbot',
  "status" "beta_feedback_status" NOT NULL DEFAULT 'new',
  "admin_note" text,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "beta_feedback_status_created_idx"
  ON "beta_feedback" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "beta_feedback_category_idx"
  ON "beta_feedback" ("category");
CREATE INDEX IF NOT EXISTS "beta_feedback_user_idx"
  ON "beta_feedback" ("user_id");
