CREATE TABLE IF NOT EXISTS "assignment_pronunciation_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sentence_id" uuid NOT NULL REFERENCES "assignment_submission_sentences"("id") ON DELETE CASCADE,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  "original_text" text NOT NULL,
  "expected_pronunciation" text NOT NULL,
  "issue_type" text DEFAULT 'tone' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "audio_timestamp_seconds" integer,
  "created_by_reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "assignment_pronunciation_marks_valid_range" CHECK ("start_offset" >= 0 AND "end_offset" > "start_offset"),
  CONSTRAINT "assignment_pronunciation_marks_valid_timestamp" CHECK ("audio_timestamp_seconds" IS NULL OR "audio_timestamp_seconds" >= 0),
  CONSTRAINT "assignment_pronunciation_marks_valid_issue" CHECK ("issue_type" IN ('tone', 'initial', 'final', 'stress', 'fluency', 'other'))
);

CREATE INDEX IF NOT EXISTS "assignment_pronunciation_marks_sentence_idx"
  ON "assignment_pronunciation_marks" ("sentence_id");
