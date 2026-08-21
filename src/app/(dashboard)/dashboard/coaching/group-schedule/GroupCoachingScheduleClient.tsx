"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  Loader2,
  UserRound,
  Video,
} from "lucide-react";

type CoachingEvent = {
  id: string;
  title: string;
  description: string;
  hostName: string;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  isCancelled: boolean;
};

function eventState(event: CoachingEvent) {
  const now = Date.now();
  const start = new Date(event.startsAt).getTime();
  const end = start + event.durationMinutes * 60_000;
  if (event.isCancelled) return "cancelled";
  if (now >= start && now <= end) return "live";
  return "upcoming";
}

export function GroupCoachingScheduleClient() {
  const [events, setEvents] = useState<CoachingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("");
  const [timeZoneConfirmed, setTimeZoneConfirmed] = useState(false);
  const [savingTimeZone, setSavingTimeZone] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      setTimeZone(window.localStorage.getItem("cmb-coaching-timezone") || detected);
      setTimeZoneConfirmed(Boolean(window.localStorage.getItem("cmb-coaching-timezone-confirmed")));
    });
  }, []);

  useEffect(() => {
    fetch("/api/coaching/events", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Failed to load schedule");
        return data as { events?: CoachingEvent[] };
      })
      .then((data) => setEvents(data.events ?? []))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Failed to load schedule"),
      )
      .finally(() => setLoading(false));
  }, []);

  const activeEvents = useMemo(
    () => events.filter((event) => eventState(event) !== "cancelled"),
    [events],
  );
  const cancelledEvents = useMemo(
    () => events.filter((event) => eventState(event) === "cancelled"),
    [events],
  );

  async function confirmTimeZone() {
    if (!timeZone) return;
    setSavingTimeZone(true);
    const response = await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: timeZone }),
    });
    setSavingTimeZone(false);
    if (!response.ok) {
      setError("We couldn't save your timezone. Please try again.");
      return;
    }
    window.localStorage.setItem("cmb-coaching-timezone", timeZone);
    window.localStorage.setItem("cmb-coaching-timezone-confirmed", "true");
    setTimeZoneConfirmed(true);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-7">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Group Coaching Schedule
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your upcoming live coaching sessions, shown in your local time.
        </p>
      </div>

      {!timeZoneConfirmed ? (
        <section className="mx-auto max-w-xl rounded-xl border border-primary/25 bg-card p-6 shadow-sm">
          <Clock3 className="mb-3 h-7 w-7 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">First, choose your timezone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Events are entered in Toronto time. We’ll convert every session to the timezone you choose.
          </p>
          <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="coaching-timezone">Your timezone</label>
          <select id="coaching-timezone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm">
            <option value="America/Toronto">Toronto / Eastern Time</option>
            <option value="America/Vancouver">Vancouver / Pacific Time</option>
            <option value="America/Edmonton">Calgary / Mountain Time</option>
            <option value="America/Winnipeg">Winnipeg / Central Time</option>
            <option value="America/New_York">New York / Eastern Time</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Paris">Central Europe</option>
            <option value="Asia/Hong_Kong">Hong Kong</option>
            <option value="Asia/Shanghai">China</option>
            <option value="Asia/Singapore">Singapore</option>
            <option value="Asia/Tokyo">Tokyo</option>
            <option value="Australia/Sydney">Sydney</option>
          </select>
          <button type="button" onClick={() => void confirmTimeZone()} disabled={!timeZone || savingTimeZone} className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {savingTimeZone ? "Saving…" : "Show my schedule"}
          </button>
        </section>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your schedule…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : activeEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No upcoming sessions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New coaching sessions for your package will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="group-coaching-events">
          {activeEvents.map((event) => {
            const state = eventState(event);
            const startsAt = new Date(event.startsAt);
            return (
              <article
                key={event.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
                data-testid="group-coaching-event"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">
                        {event.title}
                      </h2>
                      {state === "live" && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                          Live now
                        </span>
                      )}
                    </div>
                    {event.description && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {startsAt.toLocaleDateString(undefined, {
                          timeZone,
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4" />
                        {startsAt.toLocaleTimeString(undefined, {
                          timeZone,
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })}{" "}
                        · {event.durationMinutes} min
                      </span>
                      {event.hostName && (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-4 w-4" /> {event.hostName}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Video className="h-4 w-4" />
                    {state === "live" ? "Join now" : "Open session"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {cancelledEvents.length > 0 && (
        <details className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Cancelled sessions ({cancelledEvents.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {cancelledEvents.map((event) => (
              <li key={event.id} className="line-through">
                {event.title} — {new Date(event.startsAt).toLocaleString(undefined, { timeZone })}
              </li>
            ))}
          </ul>
        </details>
      )}
      {timeZoneConfirmed && (
        <button type="button" onClick={() => setTimeZoneConfirmed(false)} className="mt-6 text-xs text-muted-foreground underline hover:text-foreground">
          Change timezone ({timeZone})
        </button>
      )}
    </div>
  );
}
