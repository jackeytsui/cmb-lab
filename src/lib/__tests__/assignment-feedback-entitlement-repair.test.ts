import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "src/db/migrations/0119_restore_additive_assignment_feedback.sql",
  "utf8",
);

describe("assignment feedback entitlement repair", () => {
  it("removes only the ic_student assignment-feedback deny", () => {
    expect(migration).toContain('DELETE FROM "tag_feature_grants"');
    expect(migration).toContain("tag.\"name\" = 'ic_student'");
    expect(migration).toContain(
      "grant_row.\"feature_key\" = 'assignment_feedback'",
    );
    expect(migration).toContain("grant_row.\"grant_type\" = 'deny'");
    expect(migration).not.toContain('INSERT INTO "tag_feature_grants"');
  });

  it("keeps ic_student neutral instead of granting feedback by itself", () => {
    expect(migration).toContain(
      "It does not grant coaching material or assignment feedback on its own",
    );
    expect(migration).not.toMatch(
      /UPDATE\s+"tag_feature_grants"[\s\S]*assignment_feedback/i,
    );
    expect(migration).not.toContain(
      "grant_row.\"feature_key\" = 'coaching_material'",
    );
  });
});
