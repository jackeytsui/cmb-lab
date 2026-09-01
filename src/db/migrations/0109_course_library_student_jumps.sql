CREATE TABLE IF NOT EXISTS "course_library_module_jump_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "module_id" uuid NOT NULL REFERENCES "course_library_modules"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_library_module_jump_grants_user_module_unique"
  ON "course_library_module_jump_grants" ("user_id", "module_id");

CREATE INDEX IF NOT EXISTS "course_library_module_jump_grants_user_idx"
  ON "course_library_module_jump_grants" ("user_id");

CREATE INDEX IF NOT EXISTS "course_library_module_jump_grants_module_idx"
  ON "course_library_module_jump_grants" ("module_id");
