CREATE TABLE IF NOT EXISTS "flashcard_saves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content_key" text NOT NULL,
  "chinese" text NOT NULL,
  "simplified" text,
  "pinyin" text,
  "jyutping" text,
  "english" text,
  "source_type" text NOT NULL DEFAULT 'other',
  "source_label" text NOT NULL DEFAULT 'Flashcards',
  "source_id" text,
  "source_url" text,
  "language" text NOT NULL DEFAULT 'unknown',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcard_saves" ADD CONSTRAINT "flashcard_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flashcard_saves_user_content_key_unique" ON "flashcard_saves" USING btree ("user_id","content_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flashcard_saves_user_id_idx" ON "flashcard_saves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flashcard_saves_source_type_idx" ON "flashcard_saves" USING btree ("source_type");
