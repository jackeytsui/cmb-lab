"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Upload,
  FileAudio,
  X,
  Loader2,
  Rss,
  Copy,
  Check,
  GripVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type PendingUpload = {
  file: File;
  title: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  url?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "") // remove extension
    .replace(/[-_]/g, " ") // replace separators with spaces
    .replace(/^\d+[\s.]?\s*/, "") // strip leading numbers like "01. " or "1 "
    .replace(/\s+/g, " ")
    .trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioCourseManager() {
  const [series, setSeries] = useState<AudioSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSeriesSummary, setNewSeriesSummary] = useState("");

  // Upload state
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RSS copy state
  const [copiedRss, setCopiedRss] = useState(false);

  const activeSeries = useMemo(
    () => series.find((item) => item.id === activeSeriesId) ?? null,
    [activeSeriesId, series],
  );

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  // ---- Data fetching ----

  const loadSeries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audio-course");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      const list = (data.series ?? []) as AudioSeries[];
      setSeries(list);
      if (!activeSeriesId && list[0]) {
        setActiveSeriesId(list[0].id);
      } else if (activeSeriesId && !list.some((item) => item.id === activeSeriesId)) {
        setActiveSeriesId(list[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Series CRUD ----

  const createSeries = async () => {
    if (!newSeriesTitle.trim()) return;
    setError(null);
    const res = await fetch("/api/admin/audio-course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newSeriesTitle.trim(),
        summary: newSeriesSummary.trim(),
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
    showSuccess("Series created");
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
      setError(data.error || "Failed to save");
      return;
    }
    await loadSeries();
    showSuccess("Saved");
  };

  const togglePublish = async () => {
    if (!activeSeries) return;
    await saveSeries({ isPublished: !activeSeries.isPublished });
    showSuccess(activeSeries.isPublished ? "Unpublished" : "Published");
  };

  const deleteSeries = async () => {
    if (!activeSeries) return;
    if (!window.confirm("Delete this audio series and all lessons?")) return;
    const res = await fetch(`/api/admin/audio-course/${activeSeries.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete");
      return;
    }
    await loadSeries();
    showSuccess("Deleted");
  };

  // ---- File Upload ----

  const handleFiles = useCallback((files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(
      (f) =>
        f.type.startsWith("audio/") ||
        f.name.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm|mp4)$/i),
    );
    if (audioFiles.length === 0) return;

    // Sort by filename to preserve order
    audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    setPendingUploads((prev) => [
      ...prev,
      ...audioFiles.map((file) => ({
        file,
        title: fileToTitle(file.name),
        status: "pending" as const,
        progress: 0,
      })),
    ]);
  }, []);

  const removePending = useCallback((index: number) => {
    setPendingUploads((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updatePendingTitle = useCallback((index: number, title: string) => {
    setPendingUploads((prev) =>
      prev.map((item, i) => (i === index ? { ...item, title } : item)),
    );
  }, []);

  const uploadAllAndCreateLessons = async () => {
    if (!activeSeries || pendingUploads.length === 0) return;
    setIsUploading(true);
    setError(null);

    const results: { title: string; audioUrl: string }[] = [];

    for (let i = 0; i < pendingUploads.length; i++) {
      const item = pendingUploads[i];
      if (item.status === "done") {
        if (item.url) results.push({ title: item.title, audioUrl: item.url });
        continue;
      }

      // Mark uploading
      setPendingUploads((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "uploading" as const, progress: 30 } : p,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await fetch("/api/admin/audio-course/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        setPendingUploads((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: "done" as const, progress: 100, url: data.url }
              : p,
          ),
        );
        results.push({ title: item.title, audioUrl: data.url });
      } catch (err) {
        setPendingUploads((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "Failed",
                }
              : p,
          ),
        );
      }
    }

    // Create lessons in bulk
    if (results.length > 0) {
      const res = await fetch(
        `/api/admin/audio-course/${activeSeries.id}/lessons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessons: results.map((r) => ({
              title: r.title,
              audioUrl: r.audioUrl,
            })),
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        showSuccess(`${data.count} lesson${data.count !== 1 ? "s" : ""} added`);
        setPendingUploads([]);
        await loadSeries();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create lessons");
      }
    }

    setIsUploading(false);
  };

  // ---- Drag & Drop ----

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  // ---- Lesson CRUD ----

  const saveLesson = async (lessonId: string, payload: Partial<AudioLesson>) => {
    const res = await fetch(`/api/admin/audio-course/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save lesson");
      return;
    }
    await loadSeries();
    showSuccess("Lesson saved");
  };

  const deleteLesson = async (lessonId: string) => {
    if (!window.confirm("Remove this lesson?")) return;
    const res = await fetch(`/api/admin/audio-course/lessons/${lessonId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete lesson");
      return;
    }
    await loadSeries();
    showSuccess("Lesson removed");
  };

  // ---- RSS Feed URL ----

  const rssFeedUrl = activeSeries
    ? `${window.location.origin}/api/podcast/${activeSeries.id}/feed`
    : "";

  const copyRssUrl = useCallback(() => {
    navigator.clipboard.writeText(rssFeedUrl);
    setCopiedRss(true);
    setTimeout(() => setCopiedRss(false), 2000);
  }, [rssFeedUrl]);

  // ---- Render ----

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audio courses…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success / Error banners */}
      {successMsg && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Create new series */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create Audio Series
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            value={newSeriesTitle}
            onChange={(e) => setNewSeriesTitle(e.target.value)}
            placeholder="Series title"
            className="h-10 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
            onKeyDown={(e) => e.key === "Enter" && createSeries()}
          />
          <input
            value={newSeriesSummary}
            onChange={(e) => setNewSeriesSummary(e.target.value)}
            placeholder="Short summary (optional)"
            className="h-10 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
            onKeyDown={(e) => e.key === "Enter" && createSeries()}
          />
          <Button onClick={createSeries} disabled={!newSeriesTitle.trim()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </div>
      </section>

      {/* Two-column layout */}
      <section className="grid gap-6 lg:grid-cols-[260px,1fr]">
        {/* Sidebar: series list */}
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
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  item.id === activeSeriesId
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{item.title}</p>
                  {item.isPublished ? (
                    <span className="text-[10px] font-medium text-green-400">LIVE</span>
                  ) : (
                    <span className="text-[10px] font-medium text-zinc-500">DRAFT</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.lessons.length} lesson{item.lessons.length !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
            {series.length === 0 && (
              <p className="text-xs text-muted-foreground">No audio series yet.</p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="space-y-6">
          {activeSeries ? (
            <>
              {/* Series settings */}
              <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">
                    Series Settings
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={togglePublish}
                      className="h-8 text-xs"
                    >
                      {activeSeries.isPublished ? (
                        <>
                          <EyeOff className="mr-1 h-3.5 w-3.5" /> Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Publish
                        </>
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={deleteSeries}
                      className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                <EditableField
                  key={`title-${activeSeries.id}-${activeSeries.title}`}
                  label="Series Title"
                  value={activeSeries.title}
                  onSave={(v) => saveSeries({ title: v })}
                />
                <EditableField
                  key={`summary-${activeSeries.id}-${activeSeries.summary}`}
                  label="Summary"
                  value={activeSeries.summary}
                  onSave={(v) => saveSeries({ summary: v })}
                />
                <EditableField
                  key={`instructions-${activeSeries.id}-${activeSeries.studentInstructions}`}
                  label="Student Instructions"
                  value={activeSeries.studentInstructions}
                  multiline
                  onSave={(v) => saveSeries({ studentInstructions: v })}
                />
              </section>

              {/* Podcast RSS Feed */}
              <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Rss className="h-4 w-4 text-orange-400" />
                  <h3 className="text-base font-semibold text-foreground">
                    Podcast Distribution
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submit this RSS feed URL to Spotify, Apple Podcasts, and YouTube Music
                  so students can listen on their favorite app. The feed updates
                  automatically when you add or modify lessons.
                </p>

                {/* RSS Feed URL */}
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={rssFeedUrl}
                    className="h-9 flex-1 rounded-md border border-input bg-muted/30 px-3 text-xs font-mono text-foreground"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={copyRssUrl}
                  >
                    {copiedRss ? (
                      <Check className="mr-1 h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5" />
                    )}
                    {copiedRss ? "Copied" : "Copy"}
                  </Button>
                </div>

                {!activeSeries.isPublished && (
                  <p className="text-xs text-amber-400">
                    This series is not published yet. The RSS feed will only work after
                    you publish it.
                  </p>
                )}

                {/* External platform links (manual overrides) */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Once your podcast is listed, paste the direct links below so students see them:
                  </p>
                  <EditableField
                    key={`sp-${activeSeries.id}-${activeSeries.spotifyUrl}`}
                    label="Spotify Link"
                    value={activeSeries.spotifyUrl}
                    onSave={(v) => saveSeries({ spotifyUrl: v })}
                    placeholder="https://open.spotify.com/show/..."
                  />
                  <EditableField
                    key={`ytm-${activeSeries.id}-${activeSeries.youtubeMusicUrl}`}
                    label="YouTube Music Link"
                    value={activeSeries.youtubeMusicUrl}
                    onSave={(v) => saveSeries({ youtubeMusicUrl: v })}
                    placeholder="https://music.youtube.com/..."
                  />
                  <EditableField
                    key={`apple-${activeSeries.id}-${activeSeries.applePodcastUrl}`}
                    label="Apple Podcasts Link"
                    value={activeSeries.applePodcastUrl}
                    onSave={(v) => saveSeries({ applePodcastUrl: v })}
                    placeholder="https://podcasts.apple.com/..."
                  />
                  <EditableField
                    key={`ha-${activeSeries.id}-${activeSeries.helloAudioSeriesUrl}`}
                    label="HelloAudio Link (optional)"
                    value={activeSeries.helloAudioSeriesUrl}
                    onSave={(v) => saveSeries({ helloAudioSeriesUrl: v })}
                    placeholder="https://app.helloaudio.fm/..."
                  />
                </div>
              </section>

              {/* Upload audio files */}
              <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">
                    Upload Audio Lessons
                  </h3>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/20"
                  }`}
                >
                  <FileAudio className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-foreground">
                    Drop audio files here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MP3, M4A, WAV, OGG, AAC, FLAC — up to 4.5GB each
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Pending uploads list */}
                {pendingUploads.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {pendingUploads.length} file{pendingUploads.length !== 1 ? "s" : ""} ready
                    </p>
                    {pendingUploads.map((item, index) => (
                      <div
                        key={`${item.file.name}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5"
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            value={item.title}
                            onChange={(e) =>
                              updatePendingTitle(index, e.target.value)
                            }
                            disabled={item.status === "uploading"}
                            className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                            placeholder="Lesson title"
                          />
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{item.file.name}</span>
                            <span>·</span>
                            <span>{formatSize(item.file.size)}</span>
                            {item.status === "done" && (
                              <Check className="h-3 w-3 text-green-400" />
                            )}
                            {item.status === "uploading" && (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            )}
                            {item.status === "error" && (
                              <span className="text-red-400">{item.error}</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePending(index)}
                          disabled={item.status === "uploading"}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      onClick={uploadAllAndCreateLessons}
                      disabled={isUploading || pendingUploads.length === 0}
                      className="w-full"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1.5 h-4 w-4" />
                          Upload & Add {pendingUploads.length} Lesson
                          {pendingUploads.length !== 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </section>

              {/* Existing lessons */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Lessons ({activeSeries.lessons.length})
                </h3>
                <div className="mt-3 space-y-2">
                  {activeSeries.lessons.map((lesson, index) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      onSave={saveLesson}
                      onDelete={deleteLesson}
                    />
                  ))}
                  {activeSeries.lessons.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No lessons yet. Upload audio files above to get started.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {series.length > 0
                ? "Select a series to manage."
                : "Create your first audio series above."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const changed = draft !== value;

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="min-h-[72px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
        )}
        {changed && (
          <Button
            className="h-9 shrink-0 px-3 text-xs"
            onClick={() => onSave(draft)}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  index,
  onSave,
  onDelete,
}: {
  lesson: AudioLesson;
  index: number;
  onSave: (lessonId: string, payload: Partial<AudioLesson>) => void;
  onDelete: (lessonId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description);

  const hasChanges = title !== lesson.title || description !== lesson.description;

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-border/80">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="space-y-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!hasChanges}
                onClick={() => {
                  onSave(lesson.id, { title, description });
                  setIsEditing(false);
                }}
              >
                Save
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setTitle(lesson.title);
                  setDescription(lesson.description);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-left"
            onClick={() => setIsEditing(true)}
          >
            <p className="text-sm font-medium text-foreground">{lesson.title}</p>
            {lesson.description && (
              <p className="text-xs text-muted-foreground">{lesson.description}</p>
            )}
          </button>
        )}
      </div>
      {lesson.durationMinutes && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {lesson.durationMinutes}m
        </span>
      )}
      {!isEditing && (
        <button
          type="button"
          onClick={() => onDelete(lesson.id)}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
