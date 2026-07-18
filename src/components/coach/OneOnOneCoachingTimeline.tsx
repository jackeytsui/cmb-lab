"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Loader2,
  ExternalLink,
  CalendarPlus,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

interface CoachReminder {
  type: "sheldon" | "consultant";
  title: string;
  detail: string;
  ctaLabel: string;
  bookingUrl: string;
}

interface TimelineData {
  hasWindow: boolean;
  startDate: string | null;
  endDate: string | null;
  monthsLeft: number;
  daysLeft: number;
  totalDaysLeft: number;
  currentMonth: number;
  totalMonths: number;
  progress: number;
  isEnded: boolean;
  isNotStarted: boolean;
  hasSheldonTag: boolean;
  reminders: CoachReminder[];
}

interface TimelineResponse {
  linked: boolean;
  timeline: TimelineData | null;
}

/**
 * OneOnOneCoachingTimeline — coach-only card on a student's 1:1 page.
 *
 * Shows how many months + days the student has left in their coaching program
 * (derived from their own GHL program dates, so it differs per student), plus
 * any reminders the coach should act on: booking the tagged student's 1:1
 * sessions with Sheldon (program months 3–5), and booking a consultant call
 * once there is one month left. Purely informational for the coach; the
 * student never sees this card.
 */
export function OneOnOneCoachingTimeline({
  studentEmail,
}: {
  studentEmail: string;
}) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentEmail) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading when the selected student changes
    setLoading(true);
    fetch(
      `/api/coaching/one-on-one-timeline?studentEmail=${encodeURIComponent(studentEmail)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json: TimelineResponse | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentEmail]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading coaching timeline...
        </div>
      </div>
    );
  }

  const timeline = data?.timeline;

  // Not linked, or no program window in the CRM — friendly empty state.
  if (!data?.linked || !timeline || !timeline.hasWindow) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          <span>
            Coaching timeline unavailable — no program start/end dates found in
            the CRM for this student.
          </span>
        </div>
      </div>
    );
  }

  const startLabel = timeline.startDate
    ? format(new Date(timeline.startDate), "MMM d, yyyy")
    : "—";
  const endLabel = timeline.endDate
    ? format(new Date(timeline.endDate), "MMM d, yyyy")
    : "—";

  return (
    <div className="rounded-lg border border-sky-500/25 bg-gradient-to-br from-sky-500/10 to-blue-500/10 dark:from-sky-500/[0.07] dark:to-blue-500/[0.07] p-4 space-y-3">
      {/* Header + countdown */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-sky-600 dark:text-sky-400" />
          <div>
            <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              Coaching Timeline
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Coach-only · {startLabel} → {endLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          {timeline.isEnded ? (
            <span className="text-sm font-semibold text-muted-foreground">
              Program ended
            </span>
          ) : timeline.isNotStarted ? (
            <span className="text-sm font-semibold text-muted-foreground">
              Not started yet
            </span>
          ) : (
            <>
              <div className="text-lg font-bold text-sky-700 dark:text-sky-300 leading-none">
                {timeline.monthsLeft > 0 && (
                  <>
                    {timeline.monthsLeft}{" "}
                    <span className="text-xs font-medium">
                      {timeline.monthsLeft === 1 ? "month" : "months"}
                    </span>{" "}
                  </>
                )}
                {timeline.daysLeft}{" "}
                <span className="text-xs font-medium">
                  {timeline.daysLeft === 1 ? "day" : "days"}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                left · month {timeline.currentMonth} of {timeline.totalMonths}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!timeline.isNotStarted && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-500/15">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${Math.round(timeline.progress * 100)}%` }}
          />
        </div>
      )}

      {/* Reminders */}
      {timeline.reminders.length > 0 && (
        <div className="space-y-2 pt-1">
          {timeline.reminders.map((reminder) => (
            <ReminderBanner key={reminder.type} reminder={reminder} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderBanner({ reminder }: { reminder: CoachReminder }) {
  const isSheldon = reminder.type === "sheldon";
  const accent = isSheldon
    ? "border-violet-500/40 bg-violet-500/10"
    : "border-amber-500/40 bg-amber-500/10";
  const iconColor = isSheldon
    ? "text-violet-600 dark:text-violet-400"
    : "text-amber-600 dark:text-amber-400";
  const Icon = isSheldon ? Sparkles : CalendarPlus;
  const hasLink = reminder.bookingUrl.length > 0;

  return (
    <div className={`rounded-md border ${accent} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`size-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {reminder.title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {reminder.detail}
          </p>
          {hasLink ? (
            <a
              href={reminder.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isSheldon
                  ? "border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/15"
                  : "border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
              }`}
            >
              {reminder.ctaLabel}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <AlertCircle className="size-3" />
              Booking link not configured yet — add it in settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
