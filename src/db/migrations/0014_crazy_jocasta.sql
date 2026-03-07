-- ALTER TYPE "public"."caption_source" ADD VALUE 'whisper_auto';--> statement-breakpoint
CREATE TABLE "vocabulary_list_items" (
	"list_id" uuid NOT NULL,
	"saved_vocabulary_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_list_items_list_id_saved_vocabulary_id_pk" PRIMARY KEY("list_id","saved_vocabulary_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- CREATE TABLE "video_assignments" (
-- 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
-- 	"youtube_url" text NOT NULL,
-- 	"youtube_video_id" varchar(11) NOT NULL,
-- 	"title" text,
-- 	"notes" text,
-- 	"target_type" "assignment_target_type" NOT NULL,
-- 	"target_id" uuid NOT NULL,
-- 	"assigned_by" uuid NOT NULL,
-- 	"due_date" timestamp,
-- 	"created_at" timestamp DEFAULT now() NOT NULL,
-- 	CONSTRAINT "video_assignments_video_target_unique" UNIQUE("youtube_video_id","target_type","target_id")
-- );
-- --> statement-breakpoint
-- ALTER TABLE "lessons" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "vocabulary_list_items" ADD CONSTRAINT "vocabulary_list_items_list_id_vocabulary_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."vocabulary_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_list_items" ADD CONSTRAINT "vocabulary_list_items_saved_vocabulary_id_saved_vocabulary_id_fk" FOREIGN KEY ("saved_vocabulary_id") REFERENCES "public"."saved_vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_lists" ADD CONSTRAINT "vocabulary_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "video_assignments" ADD CONSTRAINT "video_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocabulary_list_items_list_id_idx" ON "vocabulary_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "vocabulary_list_items_saved_vocab_id_idx" ON "vocabulary_list_items" USING btree ("saved_vocabulary_id");--> statement-breakpoint
CREATE INDEX "vocabulary_lists_user_id_idx" ON "vocabulary_lists" USING btree ("user_id");--> statement-breakpoint
-- CREATE INDEX "video_assignments_assigned_by_idx" ON "video_assignments" USING btree ("assigned_by");--> statement-breakpoint
-- CREATE INDEX "video_assignments_youtube_video_id_idx" ON "video_assignments" USING btree ("youtube_video_id");