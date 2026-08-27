import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0094_vocal_hack_video_source_alignment.sql",
  ),
  "utf8",
);

describe("Vocal Hack coach-video alignment", () => {
  it("ships the complete guarded correction set", () => {
    const corrections = migration.match(
      /^        \('[0-9a-f-]{36}',/gm,
    );

    expect(corrections).toHaveLength(119);
    expect(migration).toContain(
      "sentence ->> 'id' = correction.sentence_id",
    );
    expect(migration).toContain(
      "sentence ->> 'chinese' = correction.expected_chinese",
    );
    expect(migration).toContain(
      "sentence ->> 'pinyin' = correction.expected_pinyin",
    );
    expect(migration).toContain(
      "sentence ->> 'english' = correction.expected_english",
    );
  });

  it("covers omissions, wrong source rows, numerals, and translation errors", () => {
    expect(migration).toContain(
      "我因为生了孩子，所以辞职了。当妈妈有点忙。你呢?",
    );
    expect(migration).toContain("空腹或是饭后服用都可以。");
    expect(migration).toContain("十五比零，你领先。");
    expect(migration).toContain("Hello，我叫Janelle，你叫咩名？");
    expect(migration).toContain("你有冇投資，定係淨係儲錢?");
    expect(migration).toContain("教练说。");
    expect(migration).toContain(
      "Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?",
    );
  });

  it("does not reintroduce rejected speech-recognition errors", () => {
    expect(migration).not.toContain("顾客谢谢");
    expect(migration).not.toContain("我冲洗后会觉得有点冷");
    expect(migration).not.toContain("你可以試吓唔用指紮嘅方式");
    expect(migration).not.toContain("嘉仔而家喺房唱緊呢首歌");
  });
});
