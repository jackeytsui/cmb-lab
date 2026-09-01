import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar navigation", () => {
  it("keeps Home first and available to every signed-in role", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/AppSidebar.tsx"),
      "utf8",
    );
    const overviewStart = source.indexOf('label: "Overview"');
    const adminStart = source.indexOf('label: "Admin"');
    const coursesStart = source.indexOf('label: "Courses"');
    const overviewSection = source.slice(overviewStart, adminStart);
    const adminSection = source.slice(adminStart, coursesStart);

    expect(overviewStart).toBeGreaterThan(-1);
    expect(overviewStart).toBeLessThan(adminStart);
    expect(overviewSection).toContain('minRole: "student"');
    expect(overviewSection).toContain(
      'title: "Home", url: "/home", icon: House',
    );

    expect(adminStart).toBeGreaterThan(-1);
    expect(adminStart).toBeLessThan(coursesStart);
    expect(adminSection).toContain('minRole: "admin"');
    expect(adminSection).toContain('title: "Admin Portal"');
    expect(adminSection).toContain('title: "Announcements"');
  });
});
