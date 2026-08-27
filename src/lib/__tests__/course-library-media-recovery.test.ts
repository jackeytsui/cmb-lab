import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HARD_FAILURE_MS,
  MANUAL_RETRY_MS,
  SLOW_LOAD_MS,
} from "@/components/course-library/LessonVideoPlayer";

const playerSource = readFileSync(
  path.join(
    process.cwd(),
    "src/components/course-library/LessonVideoPlayer.tsx",
  ),
  "utf8",
);
const lessonPageSource = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/page.tsx",
  ),
  "utf8",
);
const streamRouteSource = readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/course-library/stream/[lessonId]/route.ts",
  ),
  "utf8",
);

describe("course-library media recovery", () => {
  it("gives a silent media stall an actionable recovery within 30 seconds", () => {
    expect(SLOW_LOAD_MS).toBeLessThanOrEqual(10_000);
    expect(MANUAL_RETRY_MS).toBeGreaterThan(SLOW_LOAD_MS);
    expect(MANUAL_RETRY_MS).toBeLessThanOrEqual(20_000);
    expect(HARD_FAILURE_MS).toBeGreaterThan(MANUAL_RETRY_MS);
    expect(HARD_FAILURE_MS).toBeLessThanOrEqual(30_000);
    expect(playerSource).toContain("Media stalled before metadata");
    expect(playerSource).toContain('setStatus("error")');
    expect(playerSource).toContain("void diagnose()");
  });

  it("unblocks the player as soon as MP4 metadata arrives", () => {
    expect(playerSource).toContain("onLoadedMetadata={markReady}");
    expect(playerSource).toContain("HTMLMediaElement.HAVE_METADATA");
    expect(playerSource).toContain("onCanPlay={markReady}");
    expect(playerSource).toContain("onPlaying={markReady}");
  });

  it("does not force an initial media-fragment seek", () => {
    expect(lessonPageSource).not.toContain("#t=0.1");
    expect(lessonPageSource).toContain(
      "src={signMediaPath(`/api/course-library/stream/${lessonId}`)}",
    );
  });

  it("keeps authenticated video bytes out of the serverless proxy hop", () => {
    expect(streamRouteSource).toContain("issueSignedToken");
    expect(streamRouteSource).toContain("presignUrl");
    expect(streamRouteSource).toContain(
      "NextResponse.redirect(presignedUrl, 307)",
    );
    expect(streamRouteSource).not.toContain("proxyBlobMedia");
  });
});
