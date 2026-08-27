import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getUnpreparedStrongVocalHackForms,
  getVocalHackPreviewReadiness,
} from "@/lib/videoask/vocal-hack-admin-status";

const integrationClient = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/admin/integrations/videoask/VideoAskIntegrationClient.tsx",
  ),
  "utf8",
);

describe("Vocal Hack admin status projection", () => {
  it("does not offer preparation for an existing published placement", () => {
    const forms = [
      { formImportId: "published", confidence: "exact" },
      { formImportId: "new-high", confidence: "high" },
      { formImportId: "manual", confidence: "manual" },
    ];
    const placements = [
      {
        formImportId: "published",
        status: "published",
        totalSentences: 8,
        readySentences: 8,
      },
    ];

    expect(getUnpreparedStrongVocalHackForms(forms, placements)).toEqual([
      forms[1],
    ]);
  });

  it("reports published content instead of a stale AI-pending label", () => {
    expect(
      getVocalHackPreviewReadiness({
        formImportId: "published",
        status: "published",
        totalSentences: 15,
        readySentences: 15,
      }),
    ).toEqual({
      headline: "15/15 sentence text ready",
      detail: "Published",
      complete: true,
    });
  });

  it("keeps genuinely unprepared and transcribing rows actionable", () => {
    expect(getVocalHackPreviewReadiness(null)).toEqual({
      headline: "Review draft not prepared",
      detail: "Prepare before transcription",
      complete: false,
    });
    expect(
      getVocalHackPreviewReadiness({
        formImportId: "working",
        status: "transcribing",
        totalSentences: 8,
        readySentences: 3,
      }),
    ).toEqual({
      headline: "3/8 sentence text ready",
      detail: "AI transcription in progress",
      complete: false,
    });
  });

  it("reconciles the planning table and prepare action with live workflow ids", () => {
    expect(integrationClient).toContain(
      "workflowByFormImportId.get(form.formImportId)",
    );
    expect(integrationClient).toContain(
      "getVocalHackPreviewReadiness(workflowPlacement)",
    );
    expect(integrationClient).toContain(
      "formImportIds: formsToPrepare.map",
    );
    expect(integrationClient).not.toContain(
      '<p className="mt-1 text-xs text-muted-foreground">\n                          AI transcript pending',
    );
  });
});
