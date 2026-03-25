DROP INDEX "passage_read_status_user_passage_unique";--> statement-breakpoint
DROP INDEX "passage_read_status_user_id_idx";--> statement-breakpoint
DROP INDEX "script_line_progress_user_line_unique";--> statement-breakpoint
DROP INDEX "script_line_progress_user_id_idx";--> statement-breakpoint
DROP INDEX "script_lines_script_id_idx";--> statement-breakpoint
DROP INDEX "typing_progress_user_sentence_unique";--> statement-breakpoint
DROP INDEX "typing_progress_user_id_idx";--> statement-breakpoint
ALTER TABLE "coaching_notes" ADD COLUMN "explanation" text;--> statement-breakpoint
CREATE UNIQUE INDEX "passage_read_status_user_passage_idx" ON "passage_read_status" USING btree ("user_id","passage_id");--> statement-breakpoint
CREATE INDEX "passage_read_status_user_idx" ON "passage_read_status" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "script_line_progress_user_line_idx" ON "script_line_progress" USING btree ("user_id","line_id");--> statement-breakpoint
CREATE INDEX "script_line_progress_user_idx" ON "script_line_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "script_lines_script_idx" ON "script_lines" USING btree ("script_id");--> statement-breakpoint
CREATE UNIQUE INDEX "typing_progress_user_sentence_idx" ON "typing_progress" USING btree ("user_id","sentence_id");--> statement-breakpoint
CREATE INDEX "typing_progress_user_idx" ON "typing_progress" USING btree ("user_id");