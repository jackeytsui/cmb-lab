import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(absolutePath);
    return entry.name === "page.tsx" ? [absolutePath] : [];
  });
}

describe("coach route access", () => {
  it("authenticates coach routes at the edge and defers roles to the database", () => {
    const middleware = source("src/middleware.ts");

    expect(middleware).toContain('"/coach(.*)"');
    expect(middleware).toContain(
      "if (isCoachRoute(req)) {\n    return NextResponse.next();",
    );
    expect(middleware).not.toContain(
      'isCoachRoute(req) && !hasMinimumPlatformRole(role, "coach")',
    );
  });

  it("keeps every coach page protected by the database role check", () => {
    const coachRoot = path.join(
      process.cwd(),
      "src/app/(dashboard)/coach",
    );
    const pages = pageFiles(coachRoot);

    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      expect(readFileSync(page, "utf8"), page).toContain(
        'hasMinimumRole("coach")',
      );
    }
  });

  it("exposes a stable dashboard entry point and accessible page title", () => {
    const sidebar = source("src/components/layout/AppSidebar.tsx");
    const dashboard = source("src/app/(dashboard)/coach/page.tsx");

    expect(sidebar).toContain(
      '{ title: "Coach Dashboard", url: "/coach", icon: LayoutDashboard }',
    );
    expect(dashboard).toContain("<h1");
    expect(dashboard).toContain("Coach Dashboard");
  });
});
