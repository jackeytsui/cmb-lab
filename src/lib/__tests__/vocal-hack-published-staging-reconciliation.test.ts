import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0096_reconcile_published_vocal_hack_staging.sql",
  ),
  "utf8",
);

describe("published Vocal Hack staging reconciliation", () => {
  it("synchronizes reviewed display fields by stable sentence id", () => {
    expect(migration).toContain(
      "staged.\"id\"::text = published.sentence ->> 'id'",
    );
    for (const field of [
      "sort_order",
      "video_url",
      "source_prompt_text",
      "chinese",
      "pinyin",
      "english",
    ]) {
      expect(migration).toContain(`\"${field}\" =`);
    }
  });

  it("removes rejected staging rows while preserving immutable imports", () => {
    expect(migration).toContain(
      'DELETE FROM "videoask_vocal_hack_sentences" AS staged',
    );
    expect(migration).toContain(
      "entry.sentence ->> 'id' = staged.\"id\"::text",
    );
    expect(migration).not.toContain('DELETE FROM "videoask_step_imports"');
    expect(migration).not.toContain('DELETE FROM "videoask_form_imports"');
  });

  it("guards every mutation behind the matching live published source", () => {
    expect(migration.match(/placement\.\"status\" = 'published'/g)).toHaveLength(
      3,
    );
    expect(
      migration.match(
        /lesson\.\"content\" ->> 'sourceFormImportId' = placement\.\"form_import_id\"::text/g,
      ),
    ).toHaveLength(3);
    expect(migration).toContain(
      '"total_sentences" = jsonb_array_length(lesson."content" -> \'sentences\')',
    );
  });
});
