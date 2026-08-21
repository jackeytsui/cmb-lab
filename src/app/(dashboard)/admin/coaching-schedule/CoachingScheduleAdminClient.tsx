"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { TZDate } from "@date-fns/tz";

const SOURCE_TIME_ZONE = "America/Toronto";

type Tag = { id: string; name: string; color: string };
type EventRecord = {
  id: string;
  title: string;
  description: string;
  hostName: string;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  isCancelled: boolean;
  tagIds: string[];
};
type EventForm = Omit<EventRecord, "id" | "startsAt"> & { startsAt: string };

function localInputValue(value: Date | string): string {
  const source = value instanceof Date ? value : new Date(value);
  const date = new TZDate(source, SOURCE_TIME_ZONE);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function torontoInputToIso(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new TZDate(year, month - 1, day, hour, minute, SOURCE_TIME_ZONE).toISOString();
}

function emptyForm(): EventForm {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return {
    title: "",
    description: "",
    hostName: "",
    startsAt: localInputValue(next),
    durationMinutes: 60,
    meetingUrl: "",
    isCancelled: false,
    tagIds: [],
  };
}

export function CoachingScheduleAdminClient() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState<EventForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/coaching-events", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Failed to load events");
      setEvents(data.events ?? []);
      setTags(data.tags ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tagNameById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name])),
    [tags],
  );

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  };

  const edit = (event: EventRecord) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description,
      hostName: event.hostName,
      startsAt: localInputValue(event.startsAt),
      durationMinutes: event.durationMinutes,
      meetingUrl: event.meetingUrl,
      isCancelled: event.isCancelled,
      tagIds: event.tagIds,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/coaching-events/${editingId}`
          : "/api/admin/coaching-events",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            startsAt: torontoInputToIso(form.startsAt),
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Failed to save event");
      reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: EventRecord) => {
    if (!window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
    setError(null);
    const response = await fetch(`/api/admin/coaching-events/${event.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Failed to delete event");
      return;
    }
    if (editingId === event.id) reset();
    await load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        className="h-fit space-y-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">
            {editingId ? "Edit session" : "New session"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Cancel edit
            </button>
          )}
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Title</span>
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Description</span>
          <textarea
            maxLength={5_000}
            rows={3}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Coach / host</span>
          <input
            maxLength={200}
            value={form.hostName}
            onChange={(e) => setForm((prev) => ({ ...prev, hostName: e.target.value }))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Date and time (Toronto)</span>
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
              onInput={(e) =>
                setForm((prev) => ({
                  ...prev,
                  startsAt: (e.currentTarget as HTMLInputElement).value,
                }))
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Minutes</span>
            <input
              required
              type="number"
              min={15}
              max={480}
              step={15}
              value={form.durationMinutes}
              onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value) }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Meeting URL</span>
          <input
            required
            type="url"
            placeholder="https://zoom.us/j/…"
            value={form.meetingUrl}
            onChange={(e) => setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Visible to</legend>
          <p className="text-xs text-muted-foreground">
            No tags selected means every student with coaching access can see it.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
            {tags.map((tag) => (
              <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={form.tagIds.includes(tag.id)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      tagIds: e.target.checked
                        ? [...prev.tagIds, tag.id]
                        : prev.tagIds.filter((id) => id !== tag.id),
                    }))
                  }
                />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="text-foreground">{tag.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {editingId && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isCancelled}
              onChange={(e) => setForm((prev) => ({ ...prev, isCancelled: e.target.checked }))}
            />
            Mark this session cancelled
          </label>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingId ? "Save changes" : "Publish session"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">Published sessions</h2>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No group coaching sessions have been published.
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={event.isCancelled ? "font-semibold text-muted-foreground line-through" : "font-semibold text-foreground"}>
                      {event.title}
                    </h3>
                    {event.isCancelled && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-500">Cancelled</span>
                    )}
                  </div>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(event.startsAt).toLocaleString(undefined, { timeZone: SOURCE_TIME_ZONE, timeZoneName: "short" })} · {event.durationMinutes} min
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Audience: {event.tagIds.length === 0
                      ? "All coaching students"
                      : event.tagIds.map((id) => tagNameById.get(id) ?? "Unknown tag").join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => edit(event)}
                    aria-label={`Edit ${event.title}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(event)}
                    aria-label={`Delete ${event.title}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
