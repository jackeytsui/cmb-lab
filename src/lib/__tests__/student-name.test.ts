import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeStudentName } from "@/lib/student-name";

describe("imported student names", () => {
  it.each([
    ["Alvin wong wong", "Wong", "Alvin Wong"],
    ["Calvin he", "He", "Calvin He"],
    ["Malvin lam", "Lam", "Malvin Lam"],
    ["Jessica lu lu", "Lu", "Jessica Lu"],
    ["  Alex  chen  ", " Chen ", "Alex Chen"],
    ["Joe Au-Yeung", "Au-Yeung", "Joe Au-Yeung"],
    ["Aimee Be\u0301langer", "Bélanger", "Aimee Bélanger"],
  ])("removes only repeated explicit surnames: %s / %s", (first, last, expected) => {
    expect(composeStudentName(first, last)).toBe(expected);
  });

  it.each([
    ["Alvin", "Tsui", "Alvin Tsui"],
    ["Mei Mei", "Chan", "Mei Mei Chan"],
    ["Lee", "Lee", "Lee Lee"],
    ["Test", "Test", "Test Test"],
    ["Li Mei", "Li", "Li Mei Li"],
    ["Lillian", "Li", "Lillian Li"],
    ["Jane Smith-Jones", "Jones", "Jane Smith-Jones Jones"],
    ["Mary", "van der Berg", "Mary van der Berg"],
    ["Kwan lun Yeung", "lun Yeung", "Kwan lun Yeung lun Yeung"],
    ["Bernard k siu", "K siu", "Bernard k siu K siu"],
    ["王小王", "王", "王小王 王"],
    ["Jean-Luc O’Neill", "O'Neill", "Jean-Luc O’Neill O'Neill"],
    ["Alvin wong Wong", undefined, "Alvin wong Wong"],
    [null, "Wong", "Wong"],
    ["  Alvin  ", null, "Alvin"],
    [" ", undefined, null],
  ])("preserves legitimate or ambiguous name parts: %s / %s", (first, last, expected) => {
    expect(composeStudentName(first, last)).toBe(expected);
  });

  it("stays stable when an already composed full name is reimported as firstName", () => {
    let name: string | null = "Alvin wong wong";
    for (let i = 0; i < 5; i += 1) {
      name = composeStudentName(name, "Wong");
      expect(name).toBe("Alvin Wong");
    }
  });

  it.each([
    "src/app/api/webhooks/clerk/route.ts",
    "src/app/(dashboard)/layout.tsx",
    "src/app/api/admin/students/[studentId]/route.ts",
    "src/app/api/admin/students/invitations/route.ts",
    "src/app/api/admin/students/reconcile-source/route.ts",
    "src/app/api/public/enroll/route.ts",
    "src/lib/post-purchase-provisioning.ts",
  ])("guards the split-name database ingress: %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toContain('from "@/lib/student-name"');
    expect(source).toContain("composeStudentName(");
    expect(source).not.toMatch(/\[\s*(?:[\w?]+\.)?first_?[nN]ame[\s\S]{0,100}?last_?[nN]ame[^\]]*\]\s*\.filter\(Boolean\)/);
  });
});
