import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("student route access", () => {
  it("allows assignment feedback instead of redirecting students to the reader", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/proxy.ts"),
      "utf8",
    );

    expect(middleware).toContain('"/dashboard/assignment-feedback(.*)"');
  });

  it("defers the dashboard landing route to the database-backed page", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/proxy.ts"),
      "utf8",
    );

    expect(middleware).toContain(
      'req.nextUrl.pathname === "/dashboard" || req.nextUrl.pathname === "/dashboard/"',
    );
    expect(middleware).toContain("!isDashboardEntry");
  });

  it("uses the selected View As identity for dashboard landing behavior", () => {
    const dashboard = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/dashboard/page.tsx",
      ),
      "utf8",
    );

    expect(dashboard).toContain(
      'getCurrentUser as getEffectiveDbUser',
    );
    expect(dashboard).toContain(
      "const effectiveDbUser = await getEffectiveDbUser()",
    );
    expect(dashboard.indexOf("const effectiveDbUser")).toBeLessThan(
      dashboard.indexOf('if (dbUser.role === "student")'),
    );
  });
});
