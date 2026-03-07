CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "thread_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"target_type" "assignment_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"notes" text,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "thread_assignments_thread_target_unique" UNIQUE("thread_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "video_thread_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"response_type" "response_type" NOT NULL,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_thread_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"last_step_id" uuid
);
--> statement-breakpoint
CREATE TABLE "role_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"access_tier" "access_tier" DEFAULT 'full' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"all_courses" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_thread_steps" ADD COLUMN "position_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_thread_steps" ADD COLUMN "position_y" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "thread_assignments" ADD CONSTRAINT "thread_assignments_thread_id_video_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."video_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_assignments" ADD CONSTRAINT "thread_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_thread_responses" ADD CONSTRAINT "video_thread_responses_session_id_video_thread_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_thread_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_thread_responses" ADD CONSTRAINT "video_thread_responses_step_id_video_thread_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."video_thread_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_thread_sessions" ADD CONSTRAINT "video_thread_sessions_thread_id_video_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."video_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_thread_sessions" ADD CONSTRAINT "video_thread_sessions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_courses" ADD CONSTRAINT "role_courses_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_courses" ADD CONSTRAINT "role_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_features" ADD CONSTRAINT "role_features_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thread_assignments_assigned_by_idx" ON "thread_assignments" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "thread_assignments_thread_id_idx" ON "thread_assignments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "video_thread_responses_session_id_idx" ON "video_thread_responses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "video_thread_responses_step_id_idx" ON "video_thread_responses" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "video_thread_sessions_thread_student_idx" ON "video_thread_sessions" USING btree ("thread_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_courses_role_course_unique" ON "role_courses" USING btree ("role_id","course_id");--> statement-breakpoint
CREATE INDEX "role_courses_role_id_idx" ON "role_courses" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_features_role_feature_unique" ON "role_features" USING btree ("role_id","feature_key");--> statement-breakpoint
CREATE INDEX "role_features_role_id_idx" ON "role_features" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_unique" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");