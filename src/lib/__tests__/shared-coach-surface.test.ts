import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

describe("shared coach surface coverage", () => {
  it("passes shared assignments into every student authorization call", () => {
    let checked = 0;
    for (const file of files(path.join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const call of source.matchAll(/(?:canStaffAccessStudent|canAccessCoachingStudent)\(\{([\s\S]*?)\},?\s*\)/g)) {
        expect(call[1], file).toContain("additionalCoachIds");
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(19);
  });
  it("does not reintroduce primary-only assignment filters in coach lists", () => {
    for (const directory of ["src/app/(dashboard)/coach", "src/app/api/coach"]) {
      for (const file of files(path.join(process.cwd(), directory))) {
        const source = readFileSync(file, "utf8");
        // The display-name join is intentionally to the primary coach.
        expect(source.replace("eq(users.assignedCoachId, coach.id)", ""), file)
          .not.toContain("eq(users.assignedCoachId,");
      }
    }
  });
});
