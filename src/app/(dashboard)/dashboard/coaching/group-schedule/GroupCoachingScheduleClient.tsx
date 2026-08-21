"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Globe2,
  Loader2,
  Repeat2,
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

function normalizeTimeZone(timeZone: string) {
  return timeZone === "Asia/Shanghai" ? "Asia/Hong_Kong" : timeZone;
}

const TIME_ZONES = [
  { value: "America/Toronto", label: "Toronto / New York", detail: "Eastern Time" },
  { value: "America/Vancouver", label: "Vancouver", detail: "Pacific Time" },
  { value: "America/Edmonton", label: "Calgary", detail: "Mountain Time" },
  { value: "America/Winnipeg", label: "Winnipeg", detail: "Central Time" },
  { value: "Europe/London", label: "London", detail: "UK time" },
  { value: "Europe/Paris", label: "Central Europe", detail: "Paris / Berlin" },
  { value: "Asia/Hong_Kong", label: "Hong Kong / China", detail: "UTC+8" },
  { value: "Asia/Singapore", label: "Singapore", detail: "UTC+8" },
  { value: "Asia/Tokyo", label: "Tokyo", detail: "UTC+9" },
  { value: "Australia/Sydney", label: "Sydney", detail: "Australia Eastern" },
] as const;

function getEventDetails(description: string) {
  const signupUrl = description.match(/https:\/\/forms\.gle\/[^\s]+/)?.[0] ?? null;
  const repeatLabel = description.match(/Repeats every ([^(\n.]+)/)?.[1]?.trim() ?? null;
  const summary = description
    .split("\n")
    .filter((line) => !line.startsWith("Sign up here:") && !line.startsWith("Repeats every"))
    .join("\n")
    .trim();
  return { signupUrl, repeatLabel, summary };
}

function eventState(event: CoachingEvent) {
  const now = Date.now();
  const start = new Date(event.startsAt).getTime();
  const end = start + event.durationMinutes * 60_000;
  if (event.isCancelled) return "cancelled";
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
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
      const detected =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      setTimeZone(
        normalizeTimeZone(
          window.localStorage.getItem("cmb-coaching-timezone") || detected,
        ),
      );
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
    () =>
      events.filter((event) => {
        const state = eventState(event);
        return state === "upcoming" || state === "live";
      }),
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
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Inner Circle</p>
              <h1 className="text-2xl font-bold text-foreground">Group Coaching Schedule</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Find your next live session, sign up, and join from one place. All times are shown in your timezone.
          </p>
        </div>
        {timeZoneConfirmed && (
          <button type="button" onClick={() => setTimeZoneConfirmed(false)} className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground">
            <Globe2 className="h-3.5 w-3.5" />
            {TIME_ZONES.find((zone) => zone.value === timeZone)?.label ?? timeZone}
            <span className="text-primary">Change</span>
          </button>
        )}
      </div>

      {!timeZoneConfirmed ? (
        <section className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-primary/20 bg-card p-6 shadow-sm sm:p-8">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Globe2 className="h-3.5 w-3.5" /> One-time setup
            </span>
            <h2 className="text-xl font-semibold text-foreground">What timezone are you in?</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Choose once and every session will automatically appear in your local time, including daylight-saving changes.
            </p>
            <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="coaching-timezone">Your location</label>
            <div className="relative mt-2">
              <select id="coaching-timezone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 pr-11 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                {TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>{zone.label} — {zone.detail}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          <button type="button" onClick={() => void confirmTimeZone()} disabled={!timeZone || savingTimeZone} className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {savingTimeZone ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Show my schedule</>}
          </button>
          </div>
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
          {activeEvents.map((event, index) => {
            const state = eventState(event);
            const startsAt = new Date(event.startsAt);
            const details = getEventDetails(event.description);
            return (
              <article
                key={event.id}
                className={`relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6 ${index === 0 ? "border-primary/35" : "border-border"}`}
                data-testid="group-coaching-event"
              >
                {index === 0 && <div className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {index === 0 && state !== "live" && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">Next session</span>}
                      <h2 className="text-lg font-semibold text-foreground">
                        {event.title}
                      </h2>
                      {state === "live" && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                          Live now
                        </span>
                      )}
                    </div>
                    {details.summary && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {details.summary}
                      </p>
                    )}
                    {details.repeatLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <Repeat2 className="h-3.5 w-3.5" /> Every {details.repeatLabel}
                      </span>
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
                  <div className="flex shrink-0 flex-col gap-2 sm:min-w-40">
                    {details.signupUrl && (
                      <a href={details.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5">
                        Sign up <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                      <Video className="h-4 w-4" /> {state === "live" ? "Join now" : "Open session"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
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
    </div>
  );
}
