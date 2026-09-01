"use client";

import { useEffect, useState } from "react";
import {
  AnnouncementBanner,
  type ActiveAnnouncement,
} from "./AnnouncementBanner";

export function IgcAnnouncementSlot({
  initialAnnouncement,
  fallbackAnnouncement,
  pollCoaching,
}: {
  initialAnnouncement: ActiveAnnouncement | null;
  fallbackAnnouncement: ActiveAnnouncement | null;
  pollCoaching: boolean;
}) {
  const [coachingAnnouncement, setCoachingAnnouncement] =
    useState<ActiveAnnouncement | null>(initialAnnouncement);

  useEffect(() => {
    if (!pollCoaching) return;
    let cancelled = false;

    async function refreshAnnouncement() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/coaching/announcement", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          announcement?: ActiveAnnouncement | null;
        };
        if (!cancelled) setCoachingAnnouncement(data.announcement ?? null);
      } catch {
        // Retain the last known banner during a brief network interruption.
      }
    }

    void refreshAnnouncement();
    const timer = window.setInterval(refreshAnnouncement, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAnnouncement();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pollCoaching]);

  const announcement = coachingAnnouncement ?? fallbackAnnouncement;
  return announcement ? <AnnouncementBanner announcement={announcement} /> : null;
}
