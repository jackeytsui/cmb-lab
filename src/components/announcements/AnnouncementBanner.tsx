import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { PushNotificationButton } from "./PushNotificationButton";

export type ActiveAnnouncement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
};

export function AnnouncementBanner({
  announcement,
}: {
  announcement: ActiveAnnouncement;
}) {
  const headingId = `announcement-${announcement.id}`;

  return (
    <aside
      aria-labelledby={headingId}
      className="relative z-30 shrink-0 overflow-hidden border-b border-indigo-900/20 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 text-white shadow-[0_6px_22px_rgba(49,46,129,0.24)]"
    >
      <div className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-indigo-700 shadow-md">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-100">
              CMB Lab announcement
            </p>
            <h2 id={headingId} className="text-base font-bold leading-6 sm:text-lg">
              {announcement.title}
            </h2>
            <p className="mt-0.5 max-w-4xl text-sm leading-5 text-white/90">
              {announcement.body}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] lg:pl-0">
          {announcement.linkUrl ? (
            <Link
              href={announcement.linkUrl}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-700"
            >
              {announcement.linkLabel || "Learn more"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
          <PushNotificationButton />
        </div>
      </div>
    </aside>
  );
}
