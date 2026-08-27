import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0087_confident_cantonese_vocal_hack_quality.sql"
  ),
  "utf8"
);

describe("Confident Cantonese Vocal Hack release corrections", () => {
  it("ships the fully audited, guarded correction set", () => {
    const corrections = migration.match(
      /'::uuid, \d+, '(?:chinese|pinyin|english)'/g
    );

    expect(corrections).toHaveLength(62);
    expect(migration).toContain(
      "sentence ->> correction.field_name = correction.expected_value"
    );
    expect(migration).toContain("lesson.\"lesson_type\" = 'vocal_hack_canto'");
  });

  it("covers the high-risk transcription and translation failures", () => {
    expect(migration).toContain("'佢朝頭早鍾意喺星巴克買咖啡。'");
    expect(migration).toContain("'你未婚妻係美國人定係德國人？'");
    expect(migration).toContain("'你可以試吓唔用指責嘅方式'");
    expect(migration).toContain("'我覺得自己太亞洲人'");
    expect(migration).toContain("'You can add me.'");
    expect(migration).toContain(
      "'daai6 gaa1 hou2 saai3 ngo5 maai5 zo2 siu2 siu2 saang1 gwo2 lei4'"
    );
    expect(migration).toContain("'My phone number is…'");
  });

  it("removes only the two source-confirmed immigration clips from Asking for Direction", () => {
    expect(migration).toContain(
      'jsonb_array_length(lesson."content" -> \'sentences\') = 12'
    );
    expect(migration).toContain("'你今次嚟係做咩㗎?'");
    expect(migration).toContain("'有喺我電話度，我可以畀你睇。'");
    expect(migration).toContain(
      "to_jsonb((filtered.new_ordinal - 1)::integer)"
    );
  });
});
