// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReviewerAutosave } from "@/hooks/useReviewerAutosave";

function Harness({ comment }: { comment: string }) {
  const autosave = useReviewerAutosave({
    endpoint: "/api/review-draft",
    value: { comment },
    initialSavedAt: null,
  });

  return <output>{autosave.status}</output>;
}

describe("reviewer autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not create a draft until the reviewer changes something", async () => {
    render(<Harness comment="Existing feedback" />);

    await act(() => vi.advanceTimersByTimeAsync(1200));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("saves the latest changes after a short idle delay", async () => {
    const view = render(<Harness comment="" />);
    view.rerender(<Harness comment="New reviewer comment" />);

    expect(screen.getByText("pending")).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(fetch).toHaveBeenCalledWith(
      "/api/review-draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ comment: "New reviewer comment" }),
      }),
    );
    expect(screen.getByText("saved")).toBeTruthy();
  });

  it("uses a keepalive request if the reviewer leaves before the delay", () => {
    const view = render(<Harness comment="" />);
    view.rerender(<Harness comment="Leaving now" />);
    view.unmount();

    expect(fetch).toHaveBeenCalledWith(
      "/api/review-draft",
      expect.objectContaining({
        body: JSON.stringify({ comment: "Leaving now" }),
        keepalive: true,
      }),
    );
  });
});
