CREATE TABLE IF NOT EXISTS "student_tag_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE cascade,
  "is_assigned" boolean NOT NULL,
  "set_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_tag_overrides_user_tag_unique"
  ON "student_tag_overrides" ("user_id", "tag_id");
CREATE INDEX IF NOT EXISTS "student_tag_overrides_user_idx"
  ON "student_tag_overrides" ("user_id");
CREATE INDEX IF NOT EXISTS "student_tag_overrides_tag_idx"
  ON "student_tag_overrides" ("tag_id");

-- Preserve all existing staff-attributed tag assignments as explicit choices.
INSERT INTO "student_tag_overrides" (
  "user_id", "tag_id", "is_assigned", "set_by", "created_at", "updated_at"
)
SELECT
  "user_id", "tag_id", true, "assigned_by", "assigned_at", "last_modified_at"
FROM "student_tags"
WHERE "assigned_by" IS NOT NULL
ON CONFLICT ("user_id", "tag_id") DO NOTHING;
