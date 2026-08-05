-- Review-gated VideoAsk -> native Vocal Hack conversion.
--
-- Course Library lessons remain untouched while AI transcripts and placement
-- choices are staged here. An administrator publishes a completed placement
-- atomically after reviewing its destination and sentence content.

CREATE TABLE IF NOT EXISTS "videoask_vocal_hack_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_import_id" uuid NOT NULL REFERENCES "videoask_form_imports"("id") ON DELETE cascade,
  "source_group" text NOT NULL,
  "language" text NOT NULL,
  "target_course_id" uuid REFERENCES "course_library_courses"("id") ON DELETE set null,
  "target_module_id" uuid REFERENCES "course_library_modules"("id") ON DELETE set null,
  "target_lesson_id" uuid REFERENCES "course_library_lessons"("id") ON DELETE set null,
  "published_lesson_id" uuid REFERENCES "course_library_lessons"("id") ON DELETE set null,
  "target_lesson_title" text,
  "action" text NOT NULL,
  "confidence" text NOT NULL,
  "match_score" integer NOT NULL DEFAULT 0,
  "mapping_reason" text NOT NULL DEFAULT '',
  "instructions" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'planned',
  "total_sentences" integer NOT NULL DEFAULT 0,
  "ready_sentences" integer NOT NULL DEFAULT 0,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp,
  "published_at" timestamp,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "videoask_vocal_hack_placements_form_unique"
  ON "videoask_vocal_hack_placements" ("form_import_id");
CREATE INDEX IF NOT EXISTS "videoask_vocal_hack_placements_status_idx"
  ON "videoask_vocal_hack_placements" ("status");
CREATE INDEX IF NOT EXISTS "videoask_vocal_hack_placements_module_idx"
  ON "videoask_vocal_hack_placements" ("target_module_id");

CREATE TABLE IF NOT EXISTS "videoask_vocal_hack_sentences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "placement_id" uuid NOT NULL REFERENCES "videoask_vocal_hack_placements"("id") ON DELETE cascade,
  "step_import_id" uuid NOT NULL REFERENCES "videoask_step_imports"("id") ON DELETE cascade,
  "sort_order" integer NOT NULL,
  "video_url" text NOT NULL,
  "source_transcript" text,
  "chinese" text,
  "pinyin" text,
  "english" text,
  "status" text NOT NULL DEFAULT 'held',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "transcribed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "videoask_vocal_hack_sentences_step_unique"
  ON "videoask_vocal_hack_sentences" ("step_import_id");
CREATE INDEX IF NOT EXISTS "videoask_vocal_hack_sentences_order_idx"
  ON "videoask_vocal_hack_sentences" ("placement_id", "sort_order");
CREATE INDEX IF NOT EXISTS "videoask_vocal_hack_sentences_status_idx"
  ON "videoask_vocal_hack_sentences" ("status");
CREATE INDEX IF NOT EXISTS "videoask_vocal_hack_sentences_placement_idx"
  ON "videoask_vocal_hack_sentences" ("placement_id");
