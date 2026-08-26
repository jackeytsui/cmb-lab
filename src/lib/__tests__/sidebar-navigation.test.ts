import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar navigation", () => {
  it("keeps the complete admin section first and admin-only", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/AppSidebar.tsx"),
      "utf8",
    );
    const adminStart = source.indexOf('label: "Admin"');
    const coursesStart = source.indexOf('label: "Courses"');
    const adminSection = source.slice(adminStart, coursesStart);

    expect(adminStart).toBeGreaterThan(-1);
    expect(adminStart).toBeLessThan(coursesStart);
    expect(adminSection).toContain('minRole: "admin"');
    expect(adminSection).toContain('title: "Admin Portal"');
    expect(adminSection).toContain('title: "Announcements"');
  });
});
