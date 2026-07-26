-- Hard cross-course level locking: per-student early-unlock grants.
-- Intermediate/Advanced courses are locked until the previous level is 100%
-- complete; a row here (from the team or the Lab Assistant) unlocks a level
-- early. Unique (user_id, level) enforces "each level unlocks once".
DO $$ BEGIN
  CREATE TYPE "course_library_level" AS ENUM ('intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "course_library_level_unlock_source" AS ENUM ('team', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_library_level_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"level" "course_library_level" NOT NULL,
	"source" "course_library_level_unlock_source" NOT NULL,
	"granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_library_level_unlocks_user_level_unique"
  ON "course_library_level_unlocks" ("user_id", "level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_level_unlocks_user_idx"
  ON "course_library_level_unlocks" ("user_id");
