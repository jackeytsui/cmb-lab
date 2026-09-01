"use client";

import Link from "next/link";
import { ArrowRight, Megaphone, Radio, Video } from "lucide-react";
import { PushNotificationButton } from "./PushNotificationButton";

export type ActiveAnnouncement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  tone?: "default" | "coaching-upcoming" | "coaching-live";
  eyebrow?: string;
};

export function AnnouncementBanner({
  announcement,
}: {
  announcement: ActiveAnnouncement;
}) {
  const headingId = `announcement-${announcement.id}`;
  const tone = announcement.tone ?? "default";
  const isLive = tone === "coaching-live";
  const isCoaching = tone !== "default";
  const isExternalLink = announcement.linkUrl?.startsWith("https://") ?? false;
  const bannerClass = isLive
    ? "border-red-950/30 bg-gradient-to-r from-red-700 via-rose-700 to-orange-600 shadow-[0_6px_22px_rgba(185,28,28,0.3)]"
    : tone === "coaching-upcoming"
      ? "border-amber-950/25 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 shadow-[0_6px_22px_rgba(217,119,6,0.26)]"
      : "border-indigo-900/20 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 shadow-[0_6px_22px_rgba(49,46,129,0.24)]";
  const iconClass = isLive
    ? "text-red-700"
    : tone === "coaching-upcoming"
      ? "text-amber-700"
      : "text-indigo-700";
  const actionClass = isLive
    ? "text-red-700 hover:bg-red-50 focus-visible:ring-offset-red-700"
    : tone === "coaching-upcoming"
      ? "text-amber-800 hover:bg-amber-50 focus-visible:ring-offset-amber-700"
      : "text-indigo-700 hover:bg-indigo-50 focus-visible:ring-offset-indigo-700";

  return (
    <aside
      aria-labelledby={headingId}
      aria-live={isLive ? "assertive" : "polite"}
      className={`relative z-30 shrink-0 overflow-hidden border-b text-white ${bannerClass}`}
    >
      <div className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md ${iconClass}`}>
            {isLive ? (
              <Radio className="size-5 animate-pulse" aria-hidden="true" />
            ) : (
              <Megaphone className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="announcement-gradient-copy mb-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
              {announcement.eyebrow || "CMB Lab announcement"}
            </p>
            <h2
              id={headingId}
              className="announcement-gradient-copy text-base font-bold leading-6 text-white sm:text-lg"
            >
              {announcement.title}
            </h2>
            <p className="announcement-gradient-copy mt-0.5 max-w-4xl text-sm leading-5 text-white/90">
              {announcement.body}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] lg:pl-0">
          {announcement.linkUrl ? (
            <Link
              href={announcement.linkUrl}
              target={isExternalLink ? "_blank" : undefined}
              rel={isExternalLink ? "noopener noreferrer" : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 ${actionClass}`}
            >
              {isCoaching ? <Video className="size-4" aria-hidden="true" /> : null}
              {announcement.linkLabel || "Learn more"}
              {!isCoaching ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
            </Link>
          ) : null}
          <PushNotificationButton />
        </div>
      </div>
    </aside>
  );
}
