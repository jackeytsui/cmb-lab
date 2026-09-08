import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("diary submission hardening", () => {
  it("keeps AI annotations optional and editable", () => {
    const client = source(
      "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/DiaryViewer.tsx",
    );

    expect(client).toContain("Promise.allSettled");
    expect(client).toContain("requireEnglish: false");
    expect(client).toContain('field: "pinyin" | "english"');
    expect(client).toContain("Pinyin\"} (optional)");
    expect(client).toContain("English translation (optional)");
    expect(client).toContain("submit your Chinese entry as it is");
  });

  it("allows a resubmission to keep its existing recording", () => {
    const route = source(
      "src/app/api/course-library/lessons/[lessonId]/diary-submission/route.ts",
    );

    expect(route).toContain("audioUrl: z.string().url().max(2000).optional()");
    expect(route).toContain(
      "parsed.data.audioUrl ?? existing?.studentAudioUrl ?? null",
    );
    expect(route).toContain("studentAudioUrl: audioUrl");
  });
});
