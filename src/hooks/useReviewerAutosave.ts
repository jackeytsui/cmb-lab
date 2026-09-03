"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ReviewerAutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

interface UseReviewerAutosaveOptions<T> {
  endpoint: string;
  value: T;
  initialSavedAt: string | null;
  delayMs?: number;
}

/**
 * Debounced server autosave with an immediate keepalive attempt when the tab
 * is hidden, closed, or navigated away from. The submit controls can pause the
 * hook so a late draft request never recreates a draft after final submission.
 */
export function useReviewerAutosave<T>({
  endpoint,
  value,
  initialSavedAt,
  delayMs = 900,
}: UseReviewerAutosaveOptions<T>) {
  const serializedValue = useMemo(() => JSON.stringify(value), [value]);
  const latestValueRef = useRef(serializedValue);
  const lastSavedValueRef = useRef(serializedValue);
  const pausedRef = useRef(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<ReviewerAutosaveStatus>(
    initialSavedAt ? "saved" : "idle",
  );

  latestValueRef.current = serializedValue;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveLatest = useCallback(
    async function saveLatest(): Promise<void> {
      if (pausedRef.current) return;

      if (inFlightRef.current) {
        await inFlightRef.current;
        if (
          !pausedRef.current &&
          latestValueRef.current !== lastSavedValueRef.current
        ) {
          await saveLatest();
        }
        return;
      }

      const valueToSave = latestValueRef.current;
      if (valueToSave === lastSavedValueRef.current) return;
      if (mountedRef.current) setStatus("saving");

      const request = (async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: valueToSave,
          });
          if (!response.ok) {
            throw new Error("Reviewer draft autosave failed");
          }
          lastSavedValueRef.current = valueToSave;
          if (mountedRef.current) {
            setStatus(
              latestValueRef.current === valueToSave ? "saved" : "pending",
            );
          }
        } catch {
          if (mountedRef.current) setStatus("error");
        }
      })();

      inFlightRef.current = request;
      await request;
      if (inFlightRef.current === request) inFlightRef.current = null;
    },
    [endpoint],
  );

  useEffect(() => {
    clearTimer();
    if (
      pausedRef.current ||
      serializedValue === lastSavedValueRef.current
    ) {
      return;
    }

    setStatus("pending");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveLatest();
    }, delayMs);

    return clearTimer;
  }, [clearTimer, delayMs, saveLatest, serializedValue]);

  useEffect(() => {
    mountedRef.current = true;

    const saveBeforeLeaving = () => {
      if (
        pausedRef.current ||
        latestValueRef.current === lastSavedValueRef.current
      ) {
        return;
      }
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: latestValueRef.current,
        keepalive: true,
      });
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveBeforeLeaving();
    };

    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      mountedRef.current = false;
      clearTimer();
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      saveBeforeLeaving();
    };
  }, [clearTimer, endpoint]);

  const prepareForSubmit = useCallback(async () => {
    pausedRef.current = true;
    clearTimer();
    if (inFlightRef.current) await inFlightRef.current;
  }, [clearTimer]);

  const resumeAfterSubmitError = useCallback(() => {
    pausedRef.current = false;
    if (latestValueRef.current !== lastSavedValueRef.current) {
      if (mountedRef.current) setStatus("pending");
      void saveLatest();
    }
  }, [saveLatest]);

  const markSubmitted = useCallback(() => {
    pausedRef.current = true;
    clearTimer();
    lastSavedValueRef.current = latestValueRef.current;
    if (mountedRef.current) setStatus("saved");
  }, [clearTimer]);

  return {
    status,
    retry: saveLatest,
    prepareForSubmit,
    resumeAfterSubmitError,
    markSubmitted,
  };
}
