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

      {loading ? (
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
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4" />
                        {startsAt.toLocaleTimeString(undefined, {
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
                {event.title} — {new Date(event.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
