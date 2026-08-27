import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0103_quarantine_legacy_test_learning_content.sql",
  ),
  "utf8",
);

describe("legacy test learning content quarantine", () => {
  it("archives only the two exact published practice sets", () => {
    expect(migration).toContain('SET "status" = \'archived\'');
    expect(migration).toContain("f1164b9f-79ae-4727-9c2b-bd45e513cfa5");
    expect(migration).toContain("7f9db196-d82e-41f3-91f3-d9404528a9ce");
    expect(migration).toContain('AND "title" = \'Lesson 2 Quiz\'');
    expect(migration).toContain('AND "title" = \'Lesson 1: Hello Quiz\'');
    expect(migration).toContain('AND "status" = \'published\'');
  });

  it("unpublishes only the two exact legacy test courses", () => {
    expect(migration).toContain('SET "is_published" = FALSE');
    expect(migration).toContain("11111111-1111-1111-1111-111111111111");
    expect(migration).toContain("5556673f-97b3-45d0-a9ca-15a5d247f829");
    expect(migration).toContain('AND "title" = \'Beginner Cantonese\'');
    expect(migration).toContain('AND "title" = \'Test Course 1\'');
    expect(migration).toContain('AND "is_published" = TRUE');
  });

  it("preserves recovery and audit records", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toContain('UPDATE "practice_set_assignments"');
    expect(migration).not.toContain('UPDATE "practice_attempts"');
  });
});
