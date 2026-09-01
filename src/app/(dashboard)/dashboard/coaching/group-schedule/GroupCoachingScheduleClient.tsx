"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe2,
  List,
  Loader2,
  Repeat2,
  UserRound,
  Video,
} from "lucide-react";
import {
  buildCalendarMonth,
  buildCalendarWeek,
  calendarDateInTimeZone,
  calendarDateKey,
  shiftCalendarDate,
  shiftCalendarMonth,
  type CalendarDate,
  type CalendarDay,
  type CalendarMonth,
} from "@/lib/group-coaching-calendar";
import { getCoachingSessionPresentation } from "@/lib/group-coaching-session";

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

type ScheduleView = "list" | "calendar";
type CalendarRangeView = "month" | "week" | "day";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function calendarDateToUtc(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function formatCalendarHeading(
  range: CalendarRangeView,
  date: CalendarDate,
  week: CalendarDay[],
) {
  if (range === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(calendarDateToUtc(date));
  }

  if (range === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(calendarDateToUtc(date));
  }

  const start = week[0];
  const end = week.at(-1);
  if (!start || !end) return "";
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(calendarDateToUtc(start))} – ${formatter.format(calendarDateToUtc(end))}`;
}

function CalendarEventCard({
  event,
  timeZone,
  isNext,
  expanded = false,
}: {
  event: CoachingEvent;
  timeZone: string;
  isNext: boolean;
  expanded?: boolean;
}) {
  const state = eventState(event);
  const details = getEventDetails(event.description);
  const session = getCoachingSessionPresentation(event.title);
  const isCantonese = session.language === "cantonese";
  const cardColors = isCantonese
    ? "border-orange-300 bg-orange-50/80 dark:border-orange-700 dark:bg-orange-950/25"
    : "border-indigo-200 bg-indigo-50/75 dark:border-indigo-800 dark:bg-indigo-950/25";
  const languageBadgeColors = isCantonese
    ? "bg-orange-200/80 text-orange-900 dark:bg-orange-900/60 dark:text-orange-100"
    : "bg-indigo-200/80 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100";
  const accentTextColor = isCantonese
    ? "text-orange-700 dark:text-orange-300"
    : "text-indigo-700 dark:text-indigo-300";
  const actionColors = isCantonese
    ? "bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500"
    : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500";

  return (
    <article
      data-testid="calendar-event"
      data-language={session.language}
      aria-label={`${session.name}, ${session.languageLabel}, at ${new Date(event.startsAt).toLocaleTimeString(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      })}`}
      className={`min-w-0 rounded-lg border ${expanded ? "p-4" : "p-2.5"} ${cardColors} ${state === "live" ? "ring-2 ring-inset ring-red-500/50" : isNext ? "ring-1 ring-inset ring-primary/25" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`${expanded ? "text-xs" : "text-[10px]"} font-bold ${accentTextColor}`}>
          {new Date(event.startsAt).toLocaleTimeString(undefined, {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        {state === "live" && (
          <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
            Live
          </span>
        )}
      </div>
      <span
        className={`mt-1.5 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[8px] font-bold ${languageBadgeColors}`}
      >
        {session.languageLabel}
      </span>
      <h3
        title={event.title}
        className={`mt-1 whitespace-normal break-words font-semibold text-foreground ${expanded ? "text-sm leading-5" : "text-[11px] leading-[1.35]"}`}
      >
        {session.name}
      </h3>
      {expanded && details.summary && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {details.summary}
        </p>
      )}
      <div className={`grid grid-cols-1 gap-1.5 ${expanded ? "mt-3 sm:grid-cols-2" : "mt-2"}`}>
        {details.signupUrl ? (
          <a
            href={details.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 text-[10px] font-semibold text-foreground hover:border-primary/40"
          >
            Sign up <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
        ) : null}
        <a
          href={event.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-[10px] font-semibold transition-colors ${actionColors}`}
        >
          <Video className="h-2.5 w-2.5 shrink-0" />
          {state === "live" ? "Join now" : "Join"}
        </a>
      </div>
    </article>
  );
}

export function GroupCoachingScheduleClient() {
  const [events, setEvents] = useState<CoachingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("");
  const [timeZoneConfirmed, setTimeZoneConfirmed] = useState(false);
  const [savingTimeZone, setSavingTimeZone] = useState(false);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("list");
  const [calendarRange, setCalendarRange] = useState<CalendarRangeView>("month");
  const [calendarDate, setCalendarDate] = useState<CalendarDate | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const detected =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      const selectedTimeZone = normalizeTimeZone(
        window.localStorage.getItem("cmb-coaching-timezone") || detected,
      );
      const storedView = window.localStorage.getItem("cmb-coaching-schedule-view");
      const storedRange = window.localStorage.getItem("cmb-coaching-calendar-range");
      setTimeZone(selectedTimeZone);
      setCalendarDate(calendarDateInTimeZone(new Date(), selectedTimeZone));
      if (storedView === "list" || storedView === "calendar") {
        setScheduleView(storedView);
      }
      if (storedRange === "month" || storedRange === "week" || storedRange === "day") {
        setCalendarRange(storedRange);
      }
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
  const eventsByCalendarDay = useMemo(() => {
    const grouped = new Map<string, CoachingEvent[]>();
    if (!timeZone) return grouped;

    for (const event of activeEvents) {
      const key = calendarDateKey(new Date(event.startsAt), timeZone);
      const dayEvents = grouped.get(key) ?? [];
      dayEvents.push(event);
      grouped.set(key, dayEvents);
    }
    return grouped;
  }, [activeEvents, timeZone]);
  const todayKey = useMemo(
    () => (timeZone ? calendarDateKey(new Date(), timeZone) : ""),
    [timeZone],
  );
  const calendarMonth = useMemo<CalendarMonth | null>(
    () => calendarDate && ({ year: calendarDate.year, month: calendarDate.month }),
    [calendarDate],
  );
  const calendarDays = useMemo(
    () => (calendarMonth ? buildCalendarMonth(calendarMonth, todayKey) : []),
    [calendarMonth, todayKey],
  );
  const calendarWeek = useMemo(
    () => (calendarDate ? buildCalendarWeek(calendarDate, todayKey) : []),
    [calendarDate, todayKey],
  );
  const selectedDateKey = calendarDate
    ? `${calendarDate.year}-${String(calendarDate.month).padStart(2, "0")}-${String(calendarDate.day).padStart(2, "0")}`
    : "";
  const visibleCalendarDateKeys = useMemo(() => {
    if (calendarRange === "day") return new Set([selectedDateKey]);
    if (calendarRange === "week") return new Set(calendarWeek.map((day) => day.key));
    return new Set(
      calendarDays.filter((day) => day.isCurrentMonth).map((day) => day.key),
    );
  }, [calendarDays, calendarRange, calendarWeek, selectedDateKey]);
  const eventsInCalendarPeriod = useMemo(
    () => {
      if (!timeZone) return 0;
      return activeEvents.filter((event) =>
        visibleCalendarDateKeys.has(calendarDateKey(new Date(event.startsAt), timeZone)),
      ).length;
    },
    [activeEvents, timeZone, visibleCalendarDateKeys],
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
    setCalendarDate(calendarDateInTimeZone(new Date(), timeZone));
    setTimeZoneConfirmed(true);
  }

  function selectScheduleView(view: ScheduleView) {
    setScheduleView(view);
    window.localStorage.setItem("cmb-coaching-schedule-view", view);
  }

  function selectCalendarRange(range: CalendarRangeView) {
    setCalendarRange(range);
    window.localStorage.setItem("cmb-coaching-calendar-range", range);
  }

  function returnToToday() {
    if (!timeZone) return;
    setCalendarDate(calendarDateInTimeZone(new Date(), timeZone));
  }

  function shiftCalendarPeriod(offset: number) {
    setCalendarDate((date) => {
      if (!date) return date;
      if (calendarRange === "month") {
        return { ...shiftCalendarMonth(date, offset), day: 1 };
      }
      return shiftCalendarDate(date, offset * (calendarRange === "week" ? 7 : 1));
    });
  }

  function openCalendarDay(day: CalendarDate) {
    setCalendarDate(day);
    selectCalendarRange("day");
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
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-full border border-border bg-muted/40 p-1 shadow-sm"
              role="group"
              aria-label="Schedule view"
            >
              <button
                type="button"
                onClick={() => selectScheduleView("list")}
                aria-pressed={scheduleView === "list"}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${scheduleView === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => selectScheduleView("calendar")}
                aria-pressed={scheduleView === "calendar"}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${scheduleView === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <CalendarRange className="h-3.5 w-3.5" /> Calendar
              </button>
            </div>
            <button type="button" onClick={() => setTimeZoneConfirmed(false)} className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground">
              <Globe2 className="h-3.5 w-3.5" />
              {TIME_ZONES.find((zone) => zone.value === timeZone)?.label ?? timeZone}
              <span className="text-primary">Change</span>
            </button>
          </div>
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
      ) : scheduleView === "calendar" && calendarMonth && calendarDate ? (
        <section className="space-y-4" data-testid="group-coaching-calendar">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {formatCalendarHeading(calendarRange, calendarDate, calendarWeek)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {eventsInCalendarPeriod === 0
                  ? `No sessions this ${calendarRange}`
                  : `${eventsInCalendarPeriod} ${eventsInCalendarPeriod === 1 ? "session" : "sessions"} this ${calendarRange}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
                role="group"
                aria-label="Calendar range"
              >
                {(["month", "week", "day"] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => selectCalendarRange(range)}
                    aria-pressed={calendarRange === range}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${calendarRange === range ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftCalendarPeriod(-1)}
                  aria-label={`Previous ${calendarRange}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={returnToToday}
                  className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => shiftCalendarPeriod(1)}
                  aria-label={`Next ${calendarRange}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {calendarRange === "day" ? (
            <div
              className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
              data-testid="group-coaching-calendar-day"
            >
              {(eventsByCalendarDay.get(selectedDateKey) ?? []).length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {(eventsByCalendarDay.get(selectedDateKey) ?? []).map((event) => (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      timeZone={timeZone}
                      isNext={event.id === activeEvents[0]?.id}
                      expanded
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">No sessions on this day</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use the arrows to check another day.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
                <div className={calendarRange === "month" ? "min-w-[980px]" : "min-w-[920px]"}>
                  <div className="grid grid-cols-7 border-b border-border bg-muted/35">
                    {(calendarRange === "month" ? WEEKDAYS : calendarWeek).map((value, index) => {
                      const day = typeof value === "string" ? null : value;
                      return (
                        <div
                          key={day?.key ?? String(value)}
                          className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                        >
                          {day ? (
                            <button
                              type="button"
                              onClick={() => openCalendarDay(day)}
                              aria-label={`View ${WEEKDAYS[index]} ${day.month}/${day.day}`}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-primary/10 hover:text-primary"
                            >
                              <span>{WEEKDAYS[index]}</span>
                              <span
                                aria-current={day.isToday ? "date" : undefined}
                                className={`grid h-6 min-w-6 place-items-center rounded-full px-1 ${day.isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}
                              >
                                {day.day}
                              </span>
                            </button>
                          ) : (
                            String(value)
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-7">
                    {(calendarRange === "month" ? calendarDays : calendarWeek).map((day, index, days) => {
                      const dayEvents = calendarRange === "month" && !day.isCurrentMonth
                        ? []
                        : eventsByCalendarDay.get(day.key) ?? [];
                      return (
                        <div
                          key={day.key}
                          className={`${calendarRange === "month" ? "min-h-40" : "min-h-72"} min-w-0 border-border p-2.5 ${index % 7 !== 6 ? "border-r" : ""} ${calendarRange === "month" && index < days.length - 7 ? "border-b" : ""} ${calendarRange === "month" && !day.isCurrentMonth ? "bg-muted/15" : "bg-card"}`}
                        >
                          {calendarRange === "month" && (
                            <div className="mb-2">
                              <button
                                type="button"
                                onClick={() => openCalendarDay(day)}
                                aria-label={`View day ${day.day}`}
                                aria-current={day.isToday ? "date" : undefined}
                                className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-semibold transition-colors hover:bg-primary/10 hover:text-primary ${day.isToday ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : day.isCurrentMonth ? "text-foreground" : "text-muted-foreground/45"}`}
                              >
                                {day.day}
                              </button>
                            </div>
                          )}
                          <div className="space-y-2">
                            {dayEvents.map((event) => (
                              <CalendarEventCard
                                key={event.id}
                                event={event}
                                timeZone={timeZone}
                                isNext={event.id === activeEvents[0]?.id}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground lg:hidden">
                Swipe sideways to see the full {calendarRange === "month" ? "month" : "week"}.
              </p>
            </>
          )}
        </section>
      ) : (
        <div className="space-y-4" data-testid="group-coaching-events">
          {activeEvents.map((event, index) => {
            const state = eventState(event);
            const startsAt = new Date(event.startsAt);
            const details = getEventDetails(event.description);
            const session = getCoachingSessionPresentation(event.title);
            const isCantonese = session.language === "cantonese";
            return (
              <article
                key={event.id}
                data-language={session.language}
                className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6 ${isCantonese ? "border-orange-300 bg-orange-50/60 dark:border-orange-800 dark:bg-orange-950/20" : "border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20"}`}
                data-testid="group-coaching-event"
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${isCantonese ? "bg-orange-500" : "bg-indigo-600"}`} />
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {index === 0 && state !== "live" && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">Next session</span>}
                      <h2 className="text-lg font-semibold text-foreground">
                        {session.name}
                      </h2>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isCantonese ? "bg-orange-200/80 text-orange-900 dark:bg-orange-900/60 dark:text-orange-100" : "bg-indigo-200/80 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100"}`}>
                        {session.languageLabel}
                      </span>
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
                    <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${isCantonese ? "bg-orange-600 hover:bg-orange-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                      <Video className="h-4 w-4" /> {state === "live" ? "Join now" : "Join session"}
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
                {getCoachingSessionPresentation(event.title).name} — {new Date(event.startsAt).toLocaleString(undefined, { timeZone })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
