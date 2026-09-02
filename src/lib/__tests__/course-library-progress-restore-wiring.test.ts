import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Course Library one-time progress restore wiring", () => {
  it("shows the offer only to the true student before a terminal decision", () => {
    const page = source(
      "src/app/(dashboard)/dashboard/course-library/page.tsx"
    );

    expect(page).toContain("currentUser.id === realUser.id");
    expect(page).toContain("courseLibraryProgressRestoreDecisions");
    expect(page).toContain("restoreDecisionRows.length === 0");
    expect(page).toContain("CourseLibraryProgressRestoreBanner");
  });

  it("uses a durable unique decision and never changes course entitlements", () => {
    const migration = source(
      "src/db/migrations/0110_course_library_progress_restore.sql"
    );
    const action = source(
      "src/app/(dashboard)/dashboard/course-library/progress-restore-actions.ts"
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "course_library_progress_restore_decisions_user_unique"'
    );
    expect(action).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(action).toContain("loadStudentCourseLibraryProgress(currentUser)");
    expect(action).not.toContain("allowed_user_ids");
    expect(action).not.toContain("system_access_user_ids");
  });
});
