// @vitest-environment happy-dom

import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationFallbackNotice } from "@/components/reader/TranslationFallbackNotice";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TranslationFallbackNotice", () => {
  it("offers manual entry after two seconds without blocking the translation", async () => {
    vi.useFakeTimers();
    const onAddManualTranslation = vi.fn();

    render(
      <TranslationFallbackNotice
        hasTranslation={false}
        isTranslating
        translationFailed={false}
        onAddManualTranslation={onAddManualTranslation}
      />,
    );

    expect(screen.queryByText("Add English manually")).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    fireEvent.click(screen.getByText("Add English manually"));
    expect(onAddManualTranslation).toHaveBeenCalledTimes(1);
  });

  it("shows manual entry and an explicit retry after a failure", () => {
    const onAddManualTranslation = vi.fn();
    const onRetryTranslation = vi.fn();

    render(
      <TranslationFallbackNotice
        hasTranslation={false}
        isTranslating={false}
        translationFailed
        onAddManualTranslation={onAddManualTranslation}
        onRetryTranslation={onRetryTranslation}
      />,
    );

    fireEvent.click(screen.getByText("Add English manually"));
    fireEvent.click(screen.getByText("Retry"));

    expect(onAddManualTranslation).toHaveBeenCalledTimes(1);
    expect(onRetryTranslation).toHaveBeenCalledTimes(1);
  });

  it("stays hidden when a translation is already available", () => {
    render(
      <TranslationFallbackNotice
        hasTranslation
        isTranslating={false}
        translationFailed
        onAddManualTranslation={() => {}}
        onRetryTranslation={() => {}}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });
});
