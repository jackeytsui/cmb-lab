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
    expect(dashboard).toContain("Start with your next lesson");
    expect(dashboard).toContain(
      "<DashboardLearningSection courses={learningCourses} />",
    );
    expect(dashboard).toContain("<QuickAccess shortcuts={shortcuts} />");
    expect(dashboard).not.toContain('redirect("/dashboard/reader")');
    expect(dashboard).not.toContain('redirect("/dashboard/accelerator")');
    expect(dashboard).not.toContain('redirect("/admin/manage")');
  });

  it("puts permitted course continuation ahead of utilities and activity", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");
    const learning = dashboard.indexOf("<DashboardLearningSection");
    const study = dashboard.indexOf("<StudyTodayCard />");
    const xp = dashboard.indexOf("<XPOverview />");
    const quickAccess = dashboard.indexOf("<QuickAccess shortcuts={shortcuts} />");

    expect(learning).toBeGreaterThan(0);
    expect(learning).toBeLessThan(study);
    expect(study).toBeLessThan(xp);
    expect(xp).toBeLessThan(quickAccess);
  });

  it("uses the Course Library visibility policy for every home course", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain("getCourseLibraryCourseAccess(dbUser)");
    expect(dashboard).toContain(
      "rows.filter((row) => canSeeCourseLibraryCourse(row.courseId))",
    );
    expect(dashboard).toContain("courseLibraryLessonProgress.updatedAt");
    expect(dashboard).not.toContain("<CourseCard");
  });

  it("explains XP and makes automated study suggestions clearly optional", () => {
    const xp = source("src/components/xp/XPOverview.tsx");
    const studyToday = source("src/components/dashboard/StudyTodayCard.tsx");

    expect(xp).toContain("How XP &amp; activity work");
    expect(xp).toContain("XP are progress points—not grades");
    expect(xp).toContain("Complete a lesson");
    expect(xp).toContain("Reach your daily XP goal");

    expect(studyToday).toContain("Suggested next steps");
    expect(studyToday).toContain("These are not assignments");
    expect(studyToday).toContain("Start with #1");
    expect(studyToday).not.toContain("Recommended next");
  });

  it("shows Home explicitly while preserving stable reader deep links", () => {
    const sidebar = source("src/components/layout/AppSidebar.tsx");

    expect(sidebar).toContain('label: "Overview"');
    expect(sidebar).toContain('title: "Home", url: "/home"');
    expect(sidebar).toContain('url: "/reader/mandarin"');
    expect(sidebar).toContain('url: "/reader/cantonese"');
  });

  it("keeps the language-neutral reader URL as a compatibility redirect", () => {
    const readerIndex = source(
      "src/app/(dashboard)/dashboard/reader/page.tsx",
    );

    expect(readerIndex).toContain(
      "redirect(`/reader/mandarin${suffix}`)",
    );
    expect(readerIndex).toContain('query.set("lessonId", params.lessonId)');
    expect(readerIndex).toContain('query.set("onboarding", params.onboarding)');
  });

  it("marks Home active only on the clean home URL", () => {
    const navigation = source("src/components/layout/NavMain.tsx");
    const homeCase = navigation.split('if (url === "/home")')[1].split("}")[0];

    expect(homeCase).toContain('return pathname === "/home"');
    expect(homeCase).not.toContain("startsWith");
  });
});
