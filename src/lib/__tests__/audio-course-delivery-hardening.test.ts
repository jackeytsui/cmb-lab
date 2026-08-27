import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("audio course delivery hardening", () => {
  it("feature-gates both standard and extra-pack catalogues", () => {
    const standardPage = source(
      "src/app/(dashboard)/dashboard/audio-courses/page.tsx",
    );
    const standardApi = source("src/app/api/audio-courses/route.ts");
    const extraApi = source(
      "src/app/api/accelerator-extra/audio-courses/route.ts",
    );

    expect(standardPage).toContain('feature="audio_courses"');
    expect(standardApi).toContain(
      'userCanUseFeature(dbUser, "audio_courses")',
    );
    expect(extraApi).toContain(
      'userCanUseFeature(dbUser, "audio_accelerator_edition")',
    );
    expect(extraApi).toContain("getCurrentUser");
    expect(extraApi).not.toContain('from "@clerk/nextjs/server"');
  });

  it("supports extra-pack playback through the shared entitlement policy", () => {
    const access = source("src/lib/audio-course-access.ts");
    const stream = source(
      "src/app/api/audio-courses/stream/[lessonId]/route.ts",
    );

    expect(access).toContain("isExtraPackAudioCourse");
    expect(access).toContain('userCanUseFeature(user, "audio_accelerator_edition")');
    expect(stream).toContain("getAccessibleAudioLesson(user, lessonId)");
  });

  it("enforces selected-user entitlement on media, notes, and exercises", () => {
    const routes = [
      "src/app/api/audio-courses/stream/[lessonId]/route.ts",
      "src/app/api/audio-courses/notes/[lessonId]/route.ts",
      "src/app/api/audio-courses/exercises/[lessonId]/route.ts",
    ];

    for (const route of routes) {
      const contents = source(route);
      expect(contents, route).toContain("getCurrentUser");
      expect(contents, route).toContain("getAccessibleAudioLesson");
      expect(contents, route).not.toContain("getRealUser");
      expect(contents, route).not.toContain('from "@clerk/nextjs/server"');
    }

    expect(source("src/lib/assignments.ts")).toContain(
      "userCanAccessAudioCourse",
    );
  });

  it("loads exercise badges with the catalogue instead of one request per lesson", () => {
    const client = source(
      "src/app/(dashboard)/dashboard/audio-courses/AudioCourseClient.tsx",
    );
    const standardApi = source("src/app/api/audio-courses/route.ts");
    const extraApi = source(
      "src/app/api/accelerator-extra/audio-courses/route.ts",
    );

    expect(
      client.match(/fetch\(`\/api\/audio-courses\/exercises\/\$\{/g),
    ).toHaveLength(1);
    expect(client).toContain("hasExercises: lesson.hasExercises");
    expect(standardApi).toContain("loadAudioLessonExerciseSummaries");
    expect(extraApi).toContain("loadAudioLessonExerciseSummaries");
  });

  it("does not expose private blob URLs in catalogue responses", () => {
    const client = source(
      "src/app/(dashboard)/dashboard/audio-courses/AudioCourseClient.tsx",
    );
    const catalogueRoutes = [
      "src/app/api/audio-courses/route.ts",
      "src/app/api/accelerator-extra/audio-courses/route.ts",
    ];

    expect(client).toContain("hasAudio: boolean");
    expect(client).not.toContain("audioUrl: string");
    for (const route of catalogueRoutes) {
      const contents = source(route);
      expect(contents, route).toContain("hasAudio: Boolean(audioUrl)");
      expect(contents, route).not.toMatch(/^\s+audioUrl,\s*$/m);
    }
  });
});
