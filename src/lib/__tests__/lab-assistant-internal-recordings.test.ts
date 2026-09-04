import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canUseInternalRecordingFinder,
  isValidDateKey,
  recordingDateFromTitle,
  recordingMatchesDate,
  selectStudentCandidate,
} from "@/lib/lab-assistant/internal-recording-policy";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("internal Lab Assistant recording finder", () => {
  it.each(["admin", "coach", "consultant"] as const)(
    "enables recording search for %s",
    (role) => {
      expect(canUseInternalRecordingFinder(role)).toBe(true);
    },
  );

  it.each(["student", "operations", "temp"] as const)(
    "does not enable recording search for %s",
    (role) => {
      expect(canUseInternalRecordingFinder(role)).toBe(false);
    },
  );

  it.each([
    ["ICGC_20260904", "2026-09-04"],
    ["ICGC 2026-9-4", "2026-09-04"],
    ["ICGC 09/04/2026", "2026-09-04"],
    ["ICGC Sep 4, 2026", "2026-09-04"],
  ])("reads the lesson date from %s", (title, expected) => {
    expect(recordingDateFromTitle(title)).toBe(expected);
  });

  it("rejects impossible dates encoded in a title", () => {
    expect(recordingDateFromTitle("ICGC_20260231")).toBeNull();
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-09-04")).toBe(true);
  });

  it("matches a session in either the staff or Toronto timezone", () => {
    const session = {
      title: "Session 4",
      createdAt: new Date("2026-09-05T02:30:00.000Z"),
    };
    expect(recordingMatchesDate(session, "2026-09-04", "America/Vancouver")).toBe(
      true,
    );
  });

  it("prefers an exact email over multiple partial student matches", () => {
    const students = [
      { id: "1", name: "Ada Chan", email: "ada@example.com" },
      { id: "2", name: "Ada Wong", email: "ada.wong@example.com" },
    ];
    expect(selectStudentCandidate(students, "ada@example.com")).toEqual({
      status: "found",
      student: students[0],
    });
    expect(selectStudentCandidate(students, "Ada").status).toBe("ambiguous");
  });

  it("keeps database access server-only and scopes non-admin student searches", () => {
    const search = source(
      "src/lib/lab-assistant/internal-recording-search.ts",
    );
    expect(search).toContain('import "server-only"');
    expect(search).toContain("studentAssignedToCoach(actor.id)");
    expect(search).toContain('actor.role === "admin"');
    expect(search).toContain("sanitizeRecordingUrl");
  });

  it("routes verified internal roles before the student-only support pipeline", () => {
    const route = source("src/app/api/lab-assistant/route.ts");
    expect(route).toContain(
      "if (!dryRun && canUseInternalRecordingFinder(verifiedRole))",
    );
    expect(route).toContain(
      "return internalRecordingAssistantResponse(messages, user)",
    );
  });

  it("shows internal recording shortcuts and renders returned URLs as safe links", () => {
    const panel = source(
      "src/components/lab-assistant/LabAssistantPanel.tsx",
    );
    expect(panel).toContain("Internal 1:1 and ICGC recording finder");
    expect(panel).toContain("Find an ICGC recording by date");
    expect(panel).toContain('rel="noreferrer noopener"');
    expect(panel).toContain("sanitizeRecordingUrl(candidate)");
  });
});
