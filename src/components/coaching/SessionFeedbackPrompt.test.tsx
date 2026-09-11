// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionFeedbackPrompt } from "./SessionFeedbackPrompt";

const prompt = {
  sessionId: "9d6c3ad1-4dfd-4149-8df7-35cecb489233",
  title: "Session 12",
  type: "one_on_one" as const,
  coachName: "Coach May",
  occurredAt: "2026-09-10T18:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("SessionFeedbackPrompt", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("records one impression and submits a low-friction rating with an optional note", async () => {
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ prompt }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ rating: { rating: 5 } }));

    render(<SessionFeedbackPrompt />);

    expect(
      await screen.findByText("How was your recent 1:1 coaching session?"),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ action: "shown", sessionId: prompt.sessionId }),
    });

    fireEvent.click(screen.getByRole("button", { name: /5 out of 5/ }));
    fireEvent.change(
      screen.getByLabelText("Optional feedback about this coaching session"),
      { target: { value: "The live examples were very helpful." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(
      await screen.findByText("Thank you for helping us improve coaching."),
    ).toBeTruthy();
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/coaching/sessions/${prompt.sessionId}/rating`,
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        rating: 5,
        comment: "The live examples were very helpful.",
      }),
    });
  });

  it("stays invisible when there is no eligible session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ prompt: null }));

    const { container } = render(<SessionFeedbackPrompt />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe("");
  });

  it("lets a student permanently skip a session they did not attend", async () => {
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ prompt: { ...prompt, type: "inner_circle" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { container } = render(<SessionFeedbackPrompt />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "I didn't attend this session",
      }),
    );

    expect(container.innerHTML).toBe("");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ action: "skip", sessionId: prompt.sessionId }),
    });
  });
});
