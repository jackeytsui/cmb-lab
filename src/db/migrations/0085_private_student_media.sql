ALTER TABLE "submissions" ALTER COLUMN "score" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "student_media_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "student_media_uploads_user_idx"
  ON "student_media_uploads" USING btree ("user_id");
