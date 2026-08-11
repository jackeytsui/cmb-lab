import "server-only";

import { getNeonSql } from "@/db";

interface VersionInput {
  promptId: string;
  version: number;
  content: string;
  changeNote: string | null;
  createdBy: string | null;
}

/**
 * Atomically append a prompt version and advance the prompt's current value.
 * Neon HTTP does not support Drizzle's interactive transaction callback, so
 * the two writes are kept in one PostgreSQL data-modifying CTE.
 */
export async function savePromptVersion(input: VersionInput) {
  const sql = getNeonSql();
  await sql`
    WITH inserted_version AS (
      INSERT INTO "ai_prompt_versions" (
        "prompt_id", "version", "content", "change_note", "created_by"
      ) VALUES (
        ${input.promptId}, ${input.version}, ${input.content},
        ${input.changeNote}, ${input.createdBy}
      )
      RETURNING 1
    )
    UPDATE "ai_prompts"
    SET
      "current_content" = ${input.content},
      "current_version" = ${input.version},
      "updated_at" = now()
    WHERE "id" = ${input.promptId}
      AND EXISTS (SELECT 1 FROM inserted_version)
  `;
}

interface CreatePromptInput {
  slug: string;
  name: string;
  description: string;
  content: string;
  createdBy: string | null;
}

/** Create the first prompt row and its version atomically. */
export async function createVersionedChatbotPrompt(input: CreatePromptInput) {
  const sql = getNeonSql();
  await sql`
    WITH created_prompt AS (
      INSERT INTO "ai_prompts" (
        "slug", "name", "type", "description", "current_content",
        "current_version"
      ) VALUES (
        ${input.slug}, ${input.name}, 'chatbot'::prompt_type,
        ${input.description}, ${input.content}, 1
      )
      RETURNING "id"
    )
    INSERT INTO "ai_prompt_versions" (
      "prompt_id", "version", "content", "change_note", "created_by"
    )
    SELECT
      "id", 1, ${input.content},
      'Created from the Lab Assistant admin block', ${input.createdBy}
    FROM created_prompt
  `;
}
