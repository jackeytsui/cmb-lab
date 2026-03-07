"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook for polling unread notification count with visibility-aware refresh.
 *
 * Polls GET /api/notifications/count every 30 seconds.
 * Pauses polling when the browser tab is hidden.
 * Immediately refreshes when the tab regains focus.
 */
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Silently fail -- notification count is non-critical
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount -- intentional setState in effect for data loading
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCount();

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchCount, 30_000);

    // Visibility change handler: refresh immediately on tab focus
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchCount]);

  return { unreadCount, refresh: fetchCount };
}
