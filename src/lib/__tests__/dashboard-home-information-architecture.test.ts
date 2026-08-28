import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("dashboard home information architecture", () => {
  it("renders a real learning home at the dashboard index", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain("CMB Lab Home");
    expect(dashboard).toContain("Your learning home brings courses");
    expect(dashboard).toContain("<QuickAccess shortcuts={shortcuts} />");
    expect(dashboard).not.toContain('redirect("/dashboard/reader")');
    expect(dashboard).not.toContain('redirect("/dashboard/accelerator")');
    expect(dashboard).not.toContain('redirect("/admin/manage")');
  });

  it("shows Home explicitly while preserving stable reader deep links", () => {
    const sidebar = source("src/components/layout/AppSidebar.tsx");

    expect(sidebar).toContain('label: "Overview"');
    expect(sidebar).toContain('title: "Home", url: "/dashboard"');
    expect(sidebar).toContain('url: "/dashboard/reader/mandarin"');
    expect(sidebar).toContain('url: "/dashboard/reader/cantonese"');
  });

  it("keeps the language-neutral reader URL as a compatibility redirect", () => {
    const readerIndex = source(
      "src/app/(dashboard)/dashboard/reader/page.tsx",
    );

    expect(readerIndex).toContain(
      "redirect(`/dashboard/reader/mandarin${suffix}`)",
    );
    expect(readerIndex).toContain('query.set("lessonId", params.lessonId)');
    expect(readerIndex).toContain('query.set("onboarding", params.onboarding)');
  });

  it("marks Home active only on the dashboard index", () => {
    const navigation = source("src/components/layout/NavMain.tsx");
    const homeCase = navigation.split('if (url === "/dashboard")')[1].split("}")[0];

    expect(homeCase).toContain('return pathname === "/dashboard"');
    expect(homeCase).not.toContain("startsWith");
  });
});
