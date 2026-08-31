// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonVideoPlayer, STALL_RECOVERY_MS } from "@/components/course-library/LessonVideoPlayer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
let root: Root;
let container: HTMLDivElement;
let video: HTMLVideoElement;
let paused: boolean;
let ready: number;
let load: ReturnType<typeof vi.fn<() => void>>;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

async function event(name: string) {
  await act(async () => video.dispatchEvent(new Event(name)));
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<LessonVideoPlayer src="/stream" lessonId="lesson" nextHref={null} />));
  video = container.querySelector("video")!;
  paused = true;
  ready = 1;
  Object.defineProperties(video, {
    paused: { configurable: true, get: () => paused },
    readyState: { configurable: true, get: () => ready },
    duration: { configurable: true, value: 1041.7 },
  });
  load = vi.fn(() => { video.currentTime = 0; ready = 0; paused = true; });
  play = vi.fn(() => { paused = false; return Promise.resolve(); });
  video.load = load;
  video.play = play;
  await advance(20);
  await event("loadedmetadata");
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function startAt(position = 70) {
  paused = false;
  ready = 4;
  video.currentTime = position;
  await event("play");
  await event("playing");
  await event("timeupdate");
}

describe("lesson playback recovery", () => {
  it("does not autoplay on metadata or while recovering an unplayed error", async () => {
    expect(play).not.toHaveBeenCalled();
    await event("error");
    await advance(3000);
    expect(load).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reloads a persistent mid-play stall at the same timestamp with mute/rate intact", async () => {
    await startAt(70.5);
    video.muted = true;
    video.playbackRate = 1.5;
    ready = 2;
    await event("waiting");
    await advance(STALL_RECOVERY_MS);
    expect(load).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    ready = 1;
    await event("loadedmetadata");
    expect(video.currentTime).toBe(70.5);
    expect(video.muted).toBe(true);
    expect(video.defaultPlaybackRate).toBe(1.5);
    expect(fetch).not.toHaveBeenCalled(); // no completion/progress write
  });

  it("does not interrupt a brief wait that recovers naturally", async () => {
    await startAt();
    ready = 2;
    await event("waiting");
    await advance(2000);
    ready = 4;
    await event("playing");
    await advance(STALL_RECOVERY_MS);
    expect(load).not.toHaveBeenCalled();
  });

  it("does not reload paused preloads or resume after the user pauses a stall", async () => {
    ready = 2;
    await event("stalled");
    await advance(STALL_RECOVERY_MS);
    expect(load).not.toHaveBeenCalled();
    await startAt();
    ready = 2;
    await event("waiting");
    paused = true;
    await event("pause");
    await advance(STALL_RECOVERY_MS);
    expect(load).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("restores the playhead after an explicit network error instead of restarting", async () => {
    await startAt(431);
    await event("error");
    await advance(3000);
    ready = 1;
    await event("loadedmetadata");
    expect(video.currentTime).toBe(431);
    expect(play).toHaveBeenCalledOnce();
  });

  it("bounds automatic recovery and leaves a manual retry after 30 seconds", async () => {
    await startAt();
    for (let i = 0; i < 3; i++) {
      ready = 2;
      await event("waiting");
      await advance(STALL_RECOVERY_MS);
    }
    await advance(6000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Try again");
  });

  it("cancels a queued recovery when switching lessons", async () => {
    await startAt();
    ready = 2;
    await event("waiting");
    await act(async () => root.render(<LessonVideoPlayer src="/another" lessonId="next" nextHref={null} />));
    await advance(STALL_RECOVERY_MS);
    expect(load).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
