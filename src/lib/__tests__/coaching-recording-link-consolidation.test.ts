import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("coaching recording link consolidation", () => {
  it("migrates missing recording URLs before dropping the duplicate column", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "src/db/migrations/0106_consolidate_coaching_recording_links.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("SET recording_url = NULLIF(BTRIM(fathom_link), '')");
    expect(migration).toContain("WHERE NULLIF(BTRIM(recording_url), '') IS NULL");
    expect(migration).toContain("DROP COLUMN fathom_link");
  });

  it("removes the duplicate field from schema, API, UI, and exports", () => {
    const files = [
      "src/db/schema/coaching.ts",
      "src/app/api/coaching/sessions/[sessionId]/route.ts",
      "src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx",
      "src/lib/coaching-export.ts",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/fathomLink|Fathom Link/);
    }
  });
});
