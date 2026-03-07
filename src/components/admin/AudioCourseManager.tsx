"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AudioLesson = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  durationMinutes: number | null;
  sortOrder: number;
};

type AudioSeries = {
  id: string;
  title: string;
  summary: string;
  helloAudioSeriesUrl: string;
  spotifyUrl: string;
  youtubeMusicUrl: string;
  applePodcastUrl: string;
  studentInstructions: string;
  moduleId: string | null;
  lessons: AudioLesson[];
  isPublished: boolean;
};

const DEFAULT_INSTRUCTIONS =
  "1) Start with HelloAudio for the full guided sequence. 2) If you prefer external apps, use Spotify / YouTube Music / Apple links below. 3) Follow lesson order from top to bottom for best results.";

export function AudioCourseManager() {
  const [series, setSeries] = useState<AudioSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSeriesSummary, setNewSeriesSummary] = useState("");

  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonDescription, setNewLessonDescription] = useState("");
  const [newLessonAudioUrl, setNewLessonAudioUrl] = useState("");
  const [newLessonDurationMinutes, setNewLessonDurationMinutes] = useState("");

  const activeSeries = useMemo(
    () => series.find((item) => item.id === activeSeriesId) ?? null,
    [activeSeriesId, series],
  );

  const loadSeries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audio-course");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audio series");
      const list = (data.series ?? []) as AudioSeries[];
      setSeries(list);
      if (!activeSeriesId && list[0]) {
        setActiveSeriesId(list[0].id);
      } else if (activeSeriesId && !list.some((item) => item.id === activeSeriesId)) {
        setActiveSeriesId(list[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audio series");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createSeries = async () => {
    if (!newSeriesTitle.trim()) return;
    setError(null);
    const res = await fetch("/api/admin/audio-course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newSeriesTitle.trim(),
        summary: newSeriesSummary.trim(),
        studentInstructions: DEFAULT_INSTRUCTIONS,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to create series");
      return;
    }
    setNewSeriesTitle("");
    setNewSeriesSummary("");
    await loadSeries();
    if (data.series?.id) setActiveSeriesId(data.series.id);
  };

  const saveSeries = async (payload: Partial<AudioSeries>) => {
    if (!activeSeries) return;
    setError(null);
    const res = await fetch(`/api/admin/audio-course/${activeSeries.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to save series");
      return;
    }
    await loadSeries();
  };

  const deleteSeries = async () => {
    if (!activeSeries) return;
    const confirmed = window.confirm("Delete this audio series and hide all lessons?");
    if (!confirmed) return;
    const res = await fetch(`/api/admin/audio-course/${activeSeries.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete series");
      return;
    }
    await loadSeries();
  };

  const addLesson = async () => {
    if (!activeSeries) return;
    if (!newLessonTitle.trim() || !newLessonAudioUrl.trim()) {
      setError("Lesson title and audio URL are required.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/audio-course/${activeSeries.id}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newLessonTitle.trim(),
        description: newLessonDescription.trim(),
        audioUrl: newLessonAudioUrl.trim(),
        durationMinutes: newLessonDurationMinutes ? Number(newLessonDurationMinutes) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to add lesson");
      return;
    }
    setNewLessonTitle("");
    setNewLessonDescription("");
    setNewLessonAudioUrl("");
    setNewLessonDurationMinutes("");
    await loadSeries();
  };

  const saveLesson = async (lessonId: string, payload: Partial<AudioLesson>) => {
    const res = await fetch(`/api/admin/audio-course/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to save lesson");
      return;
    }
    await loadSeries();
  };

  const deleteLesson = async (lessonId: string) => {
    const confirmed = window.confirm("Remove this lesson?");
    if (!confirmed) return;
    const res = await fetch(`/api/admin/audio-course/lessons/${lessonId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete lesson");
      return;
    }
    await loadSeries();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create Audio Series
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={newSeriesTitle}
            onChange={(e) => setNewSeriesTitle(e.target.value)}
            placeholder="Series title (e.g. Daily Speaking Boost)"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            value={newSeriesSummary}
            onChange={(e) => setNewSeriesSummary(e.target.value)}
            placeholder="Series summary"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <Button className="mt-3" onClick={createSeries}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Series
        </Button>
      </section>

      <section className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Series
          </p>
          <div className="space-y-2">
            {series.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSeriesId(item.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  item.id === activeSeriesId
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.lessons.length} lessons</p>
              </button>
            ))}
            {!isLoading && series.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audio series yet.</p>
            ) : null}
          </div>
        </aside>

        <div className="space-y-6">
          {activeSeries ? (
            <>
              <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">Series Settings</h3>
                  <button
                    type="button"
                    onClick={deleteSeries}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Series
                  </button>
                </div>
                <EditableField
                  key={`series-title-${activeSeries.id}-${activeSeries.title}`}
                  label="Series Title"
                  value={activeSeries.title}
                  onSave={(value) => saveSeries({ title: value })}
                />
                <EditableField
                  key={`series-summary-${activeSeries.id}-${activeSeries.summary}`}
                  label="Summary"
                  value={activeSeries.summary}
                  onSave={(value) => saveSeries({ summary: value })}
                />
                <EditableField
                  key={`series-ha-${activeSeries.id}-${activeSeries.helloAudioSeriesUrl}`}
                  label="HelloAudio Series Link"
                  value={activeSeries.helloAudioSeriesUrl}
                  onSave={(value) => saveSeries({ helloAudioSeriesUrl: value })}
                />
                <EditableField
                  key={`series-sp-${activeSeries.id}-${activeSeries.spotifyUrl}`}
                  label="Spotify Link"
                  value={activeSeries.spotifyUrl}
                  onSave={(value) => saveSeries({ spotifyUrl: value })}
                />
                <EditableField
                  key={`series-ytm-${activeSeries.id}-${activeSeries.youtubeMusicUrl}`}
                  label="YouTube Music Link"
                  value={activeSeries.youtubeMusicUrl}
                  onSave={(value) => saveSeries({ youtubeMusicUrl: value })}
                />
                <EditableField
                  key={`series-apple-${activeSeries.id}-${activeSeries.applePodcastUrl}`}
                  label="Apple Podcast Link"
                  value={activeSeries.applePodcastUrl}
                  onSave={(value) => saveSeries({ applePodcastUrl: value })}
                />
                <EditableField
                  key={`series-instructions-${activeSeries.id}-${activeSeries.studentInstructions}`}
                  label="Student Instructions"
                  value={activeSeries.studentInstructions || DEFAULT_INSTRUCTIONS}
                  multiline
                  onSave={(value) => saveSeries({ studentInstructions: value })}
                />
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-foreground">Add Lesson</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    value={newLessonTitle}
                    onChange={(e) => setNewLessonTitle(e.target.value)}
                    placeholder="Lesson title"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={newLessonAudioUrl}
                    onChange={(e) => setNewLessonAudioUrl(e.target.value)}
                    placeholder="Lesson audio URL (HelloAudio or direct link)"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={newLessonDescription}
                    onChange={(e) => setNewLessonDescription(e.target.value)}
                    placeholder="Lesson description (optional)"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <input
                    value={newLessonDurationMinutes}
                    onChange={(e) => setNewLessonDurationMinutes(e.target.value)}
                    placeholder="Duration minutes (optional)"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <Button className="mt-3" onClick={addLesson}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Lesson
                </Button>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-foreground">Lessons</h3>
                <div className="mt-3 space-y-3">
                  {activeSeries.lessons.map((lesson) => (
                    <LessonRow
                      key={`${lesson.id}:${lesson.title}:${lesson.audioUrl}:${lesson.durationMinutes ?? ""}:${lesson.description}`}
                      lesson={lesson}
                      onSave={saveLesson}
                      onDelete={deleteLesson}
                    />
                  ))}
                  {activeSeries.lessons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lessons yet.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-foreground">Student Experience Preview</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {activeSeries.studentInstructions || DEFAULT_INSTRUCTIONS}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeSeries.helloAudioSeriesUrl ? (
                    <a className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" href={activeSeries.helloAudioSeriesUrl} target="_blank" rel="noreferrer">HelloAudio</a>
                  ) : null}
                  {activeSeries.spotifyUrl ? (
                    <a className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" href={activeSeries.spotifyUrl} target="_blank" rel="noreferrer">Spotify</a>
                  ) : null}
                  {activeSeries.youtubeMusicUrl ? (
                    <a className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" href={activeSeries.youtubeMusicUrl} target="_blank" rel="noreferrer">YouTube Music</a>
                  ) : null}
                  {activeSeries.applePodcastUrl ? (
                    <a className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" href={activeSeries.applePodcastUrl} target="_blank" rel="noreferrer">Apple</a>
                  ) : null}
                </div>
                <ol className="mt-4 space-y-2 text-sm text-foreground">
                  {activeSeries.lessons.map((lesson, index) => (
                    <li key={lesson.id} className="rounded-md border border-border px-3 py-2">
                      <span className="font-medium">{index + 1}. {lesson.title}</span>
                      {lesson.durationMinutes ? (
                        <span className="ml-2 text-xs text-muted-foreground">({lesson.durationMinutes} min)</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Choose a series to manage.
            </div>
          )}
        </div>
      </section>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      )}
      <Button className="mt-2 h-8 px-2.5 text-xs" onClick={() => onSave(draft)}>
        <Save className="mr-1 h-3.5 w-3.5" />
        Save
      </Button>
    </div>
  );
}

function LessonRow({
  lesson,
  onSave,
  onDelete,
}: {
  lesson: AudioLesson;
  onSave: (lessonId: string, payload: Partial<AudioLesson>) => void;
  onDelete: (lessonId: string) => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description);
  const [audioUrl, setAudioUrl] = useState(lesson.audioUrl);
  const [duration, setDuration] = useState(lesson.durationMinutes ? String(lesson.durationMinutes) : "");

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="Description"
        />
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="Duration (min)"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          className="h-8 px-2.5 text-xs"
          onClick={() =>
            onSave(lesson.id, {
              title,
              description,
              audioUrl,
              durationMinutes: duration ? Number(duration) : null,
            })
          }
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Save Lesson
        </Button>
        <button
          type="button"
          onClick={() => onDelete(lesson.id)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/40 px-2.5 text-xs text-red-500 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
