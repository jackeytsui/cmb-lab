CREATE TABLE "vocabulary_list_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"assigned_to_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vocabulary_list_assignments" ADD CONSTRAINT "vocabulary_list_assignments_list_id_vocabulary_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."vocabulary_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_list_assignments" ADD CONSTRAINT "vocabulary_list_assignments_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_list_assignments" ADD CONSTRAINT "vocabulary_list_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocabulary_list_assignments_student_idx" ON "vocabulary_list_assignments" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "vocabulary_list_assignments_list_idx" ON "vocabulary_list_assignments" USING btree ("list_id");