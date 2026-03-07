"use client";

import dynamic from "next/dynamic";

export const NotificationBellClient = dynamic(
  () => import("@/components/notifications/NotificationBell").then((m) => m.NotificationBell),
  { ssr: false }
);
