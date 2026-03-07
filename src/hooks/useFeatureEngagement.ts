"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

export type EngagementFeatureKey =
  | "ai_passage_reader"
  | "youtube_listening_lab"
  | "coaching_one_on_one"
  | "coaching_inner_circle";

type EventType = "page_view" | "action" | "session_end";

function createSessionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useFeatureEngagement(feature: EngagementFeatureKey) {
  const pathname = usePathname();
  const sessionKey = useMemo(() => createSessionKey(), []);
  const mountedAtRef = useRef<number>(0);
  const pageViewSentRef = useRef(false);

  const sendEvent = useCallback(
    async (
      eventType: EventType,
      options?: {
        action?: string;
        durationMs?: number;
        metadata?: Record<string, unknown>;
      },
    ) => {
      try {
        await fetch("/api/analytics/engagement/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            feature,
            eventType,
            action: options?.action,
            durationMs: options?.durationMs,
            metadata: options?.metadata,
            route: pathname,
            sessionKey,
          }),
        });
      } catch {
        // Best-effort analytics; ignore transport errors.
      }
    },
    [feature, pathname, sessionKey],
  );

  useEffect(() => {
    mountedAtRef.current = Date.now();

    if (!pageViewSentRef.current) {
      pageViewSentRef.current = true;
      void sendEvent("page_view");
    }

    const mountedAt = mountedAtRef.current;
    return () => {
      const durationMs = Math.max(0, Date.now() - mountedAt);
      void sendEvent("session_end", { durationMs });
    };
  }, [sendEvent]);

  const trackAction = useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      void sendEvent("action", { action, metadata });
    },
    [sendEvent],
  );

  return { trackAction, sessionKey };
}
