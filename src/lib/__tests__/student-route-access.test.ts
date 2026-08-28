import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("student route access", () => {
  it("allows assignment feedback as a first-class dashboard destination", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/proxy.ts"),
      "utf8",
    );

    expect(middleware).toContain('"/dashboard/assignment-feedback(.*)"');
  });

  it("allows every learning destination linked by the study plan", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/proxy.ts"),
      "utf8",
    );
    const study = readFileSync(
      path.join(process.cwd(), "src/lib/study.ts"),
      "utf8",
    );

    for (const route of [
      "/dashboard/grammar",
      "/dashboard/practice",
      "/dashboard/srs",
      "/dashboard/tone",
    ]) {
      expect(study).toContain(`href: "${route}"`);
      expect(middleware).toContain(`"${route}(.*)"`);
    }

    // Practice cards leave /dashboard for the interactive quiz player.
    expect(middleware).toContain('"/practice(.*)"');
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

  it("uses the selected View As identity for dashboard access and data", () => {
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
      dashboard.indexOf("const isCoachOrAbove = isStaffRole(dbUser.role)"),
    );
    expect(dashboard).not.toContain('redirect("/dashboard/reader")');
  });

  it("sends disallowed student routes back to Home instead of a learning tool", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/proxy.ts"),
      "utf8",
    );

    expect(middleware).toContain(
      'NextResponse.redirect(new URL("/dashboard", req.url))',
    );
    expect(middleware).not.toContain(
      'NextResponse.redirect(new URL("/dashboard/reader", req.url))',
    );
  });
});
