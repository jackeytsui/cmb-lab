"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
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
  ChevronDown,
  ChevronRight,
  GripVertical,
  Eye,
  EyeOff,
  Shield,
  ListChecks,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseForm } from "@/components/admin/exercises/ExerciseForm";
import type { PracticeExercise } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AudioLesson = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  transcript: string;
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
  allowedTagIds: string[];
  allowedUserIds: string[];
  moduleId: string | null;
  lessons: AudioLesson[];
  isPublished: boolean;
};

type Tag = {
  id: string;
  name: string;
  color: string;
};

type StudentOption = {
  id: string;
  name: string;
  email: string;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientUploadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /blob service is currently not available|failed to fetch|fetch failed|networkerror|timed out/i.test(message);
}

function normalizeUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Upload failed";

  if (/blob service is currently not available/i.test(message)) {
    return "Blob service is temporarily unavailable. Retry started automatically; please try again in 1-2 minutes if it still fails.";
  }

  if (/failed to retrieve the client token/i.test(message)) {
    return "Upload authorization failed. Please refresh, sign in again, and retry. If this persists, ask admin to verify your coach/admin access.";
  }

  if (/file is too large/i.test(message)) {
    return "File is too large for current upload limit.";
  }

  if (/content type mismatch|content type/i.test(message)) {
    return "Unsupported file type. Please upload MP3, M4A, WAV, OGG, AAC, FLAC, WEBM, or MP4 audio.";
  }

  return message;
}

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per file

async function preflightUploadCheck(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("/api/admin/audio-course/upload", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      throw new Error(data.error || `Upload service error (${res.status})`);
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Upload service is not responding (timed out after 15s). The server may be overloaded — try again in a minute.",
      );
    }
    throw err;
  }
}

async function uploadFile(
  pathname: string,
  file: File,
  onProgress: (percentage: number) => void,
) {
  console.log(`[audio-upload] starting SDK upload for "${file.name}" (${formatSize(file.size)})`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const result = await upload(pathname, file, {
      access: "private",
      contentType: file.type || "audio/mpeg",
      handleUploadUrl: "/api/admin/audio-course/upload",
      multipart: file.size > 5 * 1024 * 1024,
      addRandomSuffix: true,
      onUploadProgress: ({ percentage }) => {
        onProgress(percentage);
      },
      abortSignal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[audio-upload] success: ${result.url}`);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    console.error("[audio-upload] failed:", error);
    throw error;
  }
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

  // Tags & students for visibility
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);

  // Lesson selection for bulk operations
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);

  // Lesson drag-to-reorder
  const lessonDragRef = useRef<number | null>(null);
  const lessonDragOverRef = useRef<number | null>(null);

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
    // Load tags and students for visibility picker
    fetch("/api/admin/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags ?? []))
      .catch(() => {});
    fetch("/api/admin/students?limit=500")
      .then((r) => r.json())
      .then((d) => {
        const students = (d.students ?? []).map((s: { id: string; name?: string; email?: string }) => ({
          id: s.id,
          name: s.name || s.email || "Unknown",
          email: s.email || "",
        }));
        setAllStudents(students);
      })
      .catch(() => {});
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

  // ---- Drag-to-reorder pending uploads ----
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const handleReorderDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleReorderDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      dragOverIndexRef.current = index;
    },
    [],
  );

  const handleReorderDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragIndexRef.current;
      const to = dragOverIndexRef.current;
      dragIndexRef.current = null;
      dragOverIndexRef.current = null;
      if (from === null || to === null || from === to) return;

      setPendingUploads((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(from, 1);
        if (moved) updated.splice(to, 0, moved);
        return updated;
      });
    },
    [],
  );

  const uploadAllAndCreateLessons = async () => {
    if (!activeSeries || pendingUploads.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      // Pre-flight: verify auth + blob storage are working before uploading
      await preflightUploadCheck();

      const resultsByIndex = new Map<number, { title: string; audioUrl: string }>();
      const toUploadIndices: number[] = [];

      for (let i = 0; i < pendingUploads.length; i++) {
        const item = pendingUploads[i];
        if (item?.status === "done" && item.url) {
          resultsByIndex.set(i, { title: item.title, audioUrl: item.url });
          continue;
        }
        toUploadIndices.push(i);
      }

      const uploadOne = async (index: number) => {
        const item = pendingUploads[index];
        if (!item) return;

        setPendingUploads((prev) =>
          prev.map((p, idx) =>
            idx === index ? { ...p, status: "uploading" as const, progress: 0 } : p,
          ),
        );

        try {
          const timestamp = Date.now();
          const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const pathname = `audio-courses/${timestamp}-${safeName}`;

          const blob = await uploadFile(pathname, item.file, (percentage) => {
            setPendingUploads((prev) =>
              prev.map((p, idx) =>
                idx === index
                  ? { ...p, progress: Math.min(99, Math.round(percentage)) }
                  : p,
              ),
            );
          });

          setPendingUploads((prev) =>
            prev.map((p, idx) =>
              idx === index
                ? { ...p, status: "done" as const, progress: 100, url: blob.url }
                : p,
            ),
          );
          resultsByIndex.set(index, { title: item.title, audioUrl: blob.url });
        } catch (err) {
          setPendingUploads((prev) =>
            prev.map((p, idx) =>
              idx === index
                ? {
                    ...p,
                    status: "error" as const,
                    error: normalizeUploadError(err),
                  }
                : p,
            ),
          );
        }
      };

      const CONCURRENT_UPLOADS = 4;
      let cursor = 0;

      const worker = async () => {
        while (cursor < toUploadIndices.length) {
          const next = toUploadIndices[cursor];
          cursor += 1;
          if (typeof next === "number") {
            await uploadOne(next);
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENT_UPLOADS, toUploadIndices.length) },
          () => worker(),
        ),
      );

      const results = Array.from(resultsByIndex.entries())
        .sort(([a], [b]) => a - b)
        .map(([, value]) => value);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
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
    if (!window.confirm("Are you sure you want to delete this lesson? The audio file will be permanently removed.")) return;
    const res = await fetch(`/api/admin/audio-course/lessons/${lessonId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete lesson");
      return;
    }
    setSelectedLessonIds((prev) => prev.filter((id) => id !== lessonId));
    await loadSeries();
    showSuccess("Lesson removed");
  };

  const bulkDeleteLessons = async () => {
    if (selectedLessonIds.length === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedLessonIds.length} lesson${selectedLessonIds.length !== 1 ? "s" : ""}? The audio files will be permanently removed.`,
      )
    )
      return;
    setError(null);
    const res = await fetch("/api/admin/audio-course/lessons/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", lessonIds: selectedLessonIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete lessons");
      return;
    }
    const count = selectedLessonIds.length;
    setSelectedLessonIds([]);
    await loadSeries();
    showSuccess(`${count} lesson${count !== 1 ? "s" : ""} deleted`);
  };

  const reorderLessons = async (reordered: AudioLesson[]) => {
    if (!activeSeries) return;
    const order = reordered.map((l, i) => ({ id: l.id, sortOrder: i }));
    // Optimistic update
    setSeries((prev) =>
      prev.map((s) =>
        s.id === activeSeries.id ? { ...s, lessons: reordered } : s,
      ),
    );
    const res = await fetch("/api/admin/audio-course/lessons/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", order }),
    });
    if (!res.ok) {
      setError("Failed to reorder");
      await loadSeries();
    }
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
            {series.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-1">
                {/* Move up/down */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newOrder = [...series];
                      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                      setSeries(newOrder);
                      await fetch("/api/admin/audio-course", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ order: newOrder.map((s, i) => ({ id: s.id, sortOrder: i })) }),
                      });
                    }}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === series.length - 1}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newOrder = [...series];
                      [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                      setSeries(newOrder);
                      await fetch("/api/admin/audio-course", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ order: newOrder.map((s, i) => ({ id: s.id, sortOrder: i })) }),
                      });
                    }}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setActiveSeriesId(item.id); setSelectedLessonIds([]); }}
                  className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
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
              </div>
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

              {/* Visibility / Access Control */}
              <VisibilitySection
                key={`vis-${activeSeries.id}`}
                series={activeSeries}
                allTags={allTags}
                allStudents={allStudents}
                onSave={(tagIds, userIds) =>
                  saveSeries({ allowedTagIds: tagIds, allowedUserIds: userIds })
                }
              />

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
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {pendingUploads.length} file{pendingUploads.length !== 1 ? "s" : ""} queued
                        {isUploading && ` — ${pendingUploads.filter((p) => p.status === "done").length}/${pendingUploads.length} done`}
                      </p>
                      {!isUploading && pendingUploads.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Drag to reorder
                        </p>
                      )}
                    </div>

                    {/* Overall progress bar */}
                    {isUploading && (
                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{
                              width: `${Math.round(
                                pendingUploads.reduce(
                                  (sum, p) =>
                                    sum +
                                    (p.status === "done"
                                      ? 100
                                      : p.status === "error"
                                        ? 0
                                        : p.progress),
                                  0,
                                ) / pendingUploads.length,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {pendingUploads.map((item, index) => (
                      <div
                        key={`${item.file.name}-${index}`}
                        draggable={!isUploading && item.status === "pending"}
                        onDragStart={() => handleReorderDragStart(index)}
                        onDragOver={(e) => handleReorderDragOver(e, index)}
                        onDrop={handleReorderDrop}
                        className={`flex items-center gap-2 rounded-lg border bg-background p-2.5 ${
                          item.status === "done"
                            ? "border-green-500/30 bg-green-500/5"
                            : item.status === "error"
                              ? "border-red-500/30 bg-red-500/5"
                              : "border-border"
                        } ${!isUploading && item.status === "pending" ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          {!isUploading && item.status === "pending" && (
                            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            value={item.title}
                            onChange={(e) =>
                              updatePendingTitle(index, e.target.value)
                            }
                            disabled={item.status === "uploading" || item.status === "done"}
                            className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                            placeholder="Lesson title"
                          />
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{item.file.name}</span>
                            <span>·</span>
                            <span>{formatSize(item.file.size)}</span>
                            {item.status === "done" && (
                              <span className="flex items-center gap-1 text-green-500">
                                <Check className="h-3 w-3" /> Done
                              </span>
                            )}
                            {item.status === "uploading" && (
                              <span className="flex items-center gap-1 text-primary">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {item.progress}%
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="text-red-400">{item.error}</span>
                            )}
                          </div>
                          {/* Per-file progress bar */}
                          {item.status === "uploading" && (
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePending(index)}
                          disabled={item.status === "uploading"}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
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
                          Uploading {pendingUploads.filter((p) => p.status === "done").length}/{pendingUploads.length}…
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
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">
                    Lessons ({activeSeries.lessons.length})
                  </h3>
                  {activeSeries.lessons.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedLessonIds.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                          onClick={bulkDeleteLessons}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete {selectedLessonIds.length}
                        </Button>
                      )}
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (selectedLessonIds.length === activeSeries.lessons.length) {
                            setSelectedLessonIds([]);
                          } else {
                            setSelectedLessonIds(activeSeries.lessons.map((l) => l.id));
                          }
                        }}
                      >
                        {selectedLessonIds.length === activeSeries.lessons.length
                          ? "Deselect all"
                          : "Select all"}
                      </button>
                    </div>
                  )}
                </div>
                {activeSeries.lessons.length > 1 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Drag to reorder
                  </p>
                )}
                <div className="mt-3 space-y-2">
                  {activeSeries.lessons.map((lesson, index) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      selected={selectedLessonIds.includes(lesson.id)}
                      onToggleSelect={(id) =>
                        setSelectedLessonIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                      onSave={saveLesson}
                      onDelete={deleteLesson}
                      draggable={activeSeries.lessons.length > 1}
                      onDragStart={() => { lessonDragRef.current = index; }}
                      onDragOver={(e) => { e.preventDefault(); lessonDragOverRef.current = index; }}
                      onDrop={() => {
                        const from = lessonDragRef.current;
                        const to = lessonDragOverRef.current;
                        lessonDragRef.current = null;
                        lessonDragOverRef.current = null;
                        if (from === null || to === null || from === to) return;
                        const updated = [...activeSeries.lessons];
                        const [moved] = updated.splice(from, 1);
                        if (moved) updated.splice(to, 0, moved);
                        reorderLessons(updated);
                      }}
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

function VisibilitySection({
  series,
  allTags,
  allStudents,
  onSave,
}: {
  series: AudioSeries;
  allTags: Tag[];
  allStudents: StudentOption[];
  onSave: (tagIds: string[], userIds: string[]) => void;
}) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    series.allowedTagIds ?? [],
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    series.allowedUserIds ?? [],
  );
  const [tagSearch, setTagSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const hasChanges =
    JSON.stringify([...selectedTagIds].sort()) !==
      JSON.stringify([...(series.allowedTagIds ?? [])].sort()) ||
    JSON.stringify([...selectedUserIds].sort()) !==
      JSON.stringify([...(series.allowedUserIds ?? [])].sort());

  const isRestricted = selectedTagIds.length > 0 || selectedUserIds.length > 0;

  // Tag search/filter
  const filteredTags = tagSearch.trim()
    ? allTags.filter((t) =>
        t.name.toLowerCase().includes(tagSearch.toLowerCase()),
      )
    : allTags;

  // Student search (single)
  const filteredStudents = studentSearch.trim()
    ? allStudents
        .filter(
          (s) =>
            !selectedUserIds.includes(s.id) &&
            (s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
              s.email.toLowerCase().includes(studentSearch.toLowerCase())),
        )
        .slice(0, 10)
    : [];

  // Bulk add: parse comma/newline separated emails, match to students
  const handleBulkAdd = () => {
    const inputs = bulkInput
      .split(/[,\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (inputs.length === 0) return;

    const newIds: string[] = [];
    for (const input of inputs) {
      const match = allStudents.find(
        (s) =>
          s.email.toLowerCase() === input ||
          s.name.toLowerCase() === input,
      );
      if (match && !selectedUserIds.includes(match.id) && !newIds.includes(match.id)) {
        newIds.push(match.id);
      }
    }
    if (newIds.length > 0) {
      setSelectedUserIds((prev) => [...prev, ...newIds]);
    }
    setBulkInput("");
    setShowBulk(false);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-amber-400" />
        <h3 className="text-base font-semibold text-foreground">Visibility</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {isRestricted
          ? "This series is restricted to selected tags/students only."
          : "This series is visible to all students. Add tags or specific students to restrict access."}
      </p>

      {/* ---- Tag picker ---- */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Restrict by Tags
            {selectedTagIds.length > 0 && (
              <span className="ml-1 text-primary">({selectedTagIds.length})</span>
            )}
          </p>
          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTagIds([])}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Tag search */}
        <input
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          placeholder="Search tags…"
          className="mb-2 h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
        />

        {/* Selected tags */}
        {selectedTagIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedTagIds.map((tid) => {
              const tag = allTags.find((t) => t.id === tid);
              if (!tag) return null;
              return (
                <span
                  key={tid}
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedTagIds((prev) => prev.filter((id) => id !== tid))
                    }
                    className="ml-0.5 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Available tags */}
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {filteredTags
            .filter((t) => !selectedTagIds.includes(t.id))
            .map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelectedTagIds((prev) => [...prev, tag.id])}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}
          {filteredTags.filter((t) => !selectedTagIds.includes(t.id)).length === 0 && (
            <span className="text-xs text-muted-foreground">
              {allTags.length === 0
                ? "No tags created yet."
                : tagSearch
                  ? "No matching tags."
                  : "All tags selected."}
            </span>
          )}
        </div>
      </div>

      {/* ---- Student picker ---- */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Restrict by Specific Students
            {selectedUserIds.length > 0 && (
              <span className="ml-1 text-primary">({selectedUserIds.length})</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {selectedUserIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedUserIds([])}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowBulk(!showBulk)}
              className="text-[10px] text-primary hover:text-primary/80"
            >
              {showBulk ? "Single search" : "Bulk add"}
            </button>
          </div>
        </div>

        {/* Selected students */}
        {selectedUserIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {selectedUserIds.map((uid) => {
              const student = allStudents.find((s) => s.id === uid);
              return (
                <span
                  key={uid}
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {student?.email || student?.name || uid}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedUserIds((prev) => prev.filter((id) => id !== uid))
                    }
                    className="ml-0.5 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {showBulk ? (
          /* Bulk input mode */
          <div className="space-y-2">
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={"Paste emails separated by commas or new lines:\nstudent1@example.com, student2@example.com\nstudent3@example.com"}
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!bulkInput.trim()}
              onClick={handleBulkAdd}
            >
              Add matching students
            </Button>
          </div>
        ) : (
          /* Single search mode */
          <div className="relative">
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students by name or email…"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            {filteredStudents.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserIds((prev) => [...prev, s.id]);
                      setStudentSearch("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/30"
                  >
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      {hasChanges && (
        <Button
          size="sm"
          onClick={() => onSave(selectedTagIds, selectedUserIds)}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Save Visibility
        </Button>
      )}
    </section>
  );
}

function LessonRow({
  lesson,
  index,
  selected,
  onToggleSelect,
  onSave,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  lesson: AudioLesson;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSave: (lessonId: string, payload: Partial<AudioLesson>) => void;
  onDelete: (lessonId: string) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description);
  const [transcript, setTranscript] = useState(lesson.transcript || "");
  const [showTranscript, setShowTranscript] = useState(false);
  const [showExercises, setShowExercises] = useState(false);

  const hasChanges =
    title !== lesson.title ||
    description !== lesson.description ||
    transcript !== (lesson.transcript || "");

  return (
    <div
      className={`group rounded-lg border bg-background p-2.5 transition-colors hover:border-border/80 ${
        selected ? "border-primary/40 bg-primary/5" : "border-border"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2">
        {draggable && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        )}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lesson.id)}
          className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
        />
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
              <div>
                <button
                  type="button"
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="mb-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showTranscript ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Transcript {transcript ? "(has content)" : "(empty)"}
                </button>
                {showTranscript && (
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste transcript here (optional). Students will see this as a collapsible panel while listening."
                    className="min-h-[100px] w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!hasChanges}
                  onClick={() => {
                    onSave(lesson.id, { title, description, transcript });
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
                    setTranscript(lesson.transcript || "");
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
              {lesson.transcript && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Has transcript</p>
              )}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {lesson.durationMinutes && (
            <span className="text-xs text-muted-foreground mr-1">
              {lesson.durationMinutes}m
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowExercises(!showExercises)}
            className={`rounded p-1 transition-colors ${
              showExercises ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Manage exercises"
          >
            <ListChecks className="h-3.5 w-3.5" />
          </button>
          {!isEditing && (
            <button
              type="button"
              onClick={() => onDelete(lesson.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Exercises section */}
      {showExercises && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <LessonExercises lessonId={lesson.id} lessonTitle={lesson.title} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson Exercises Manager
// ---------------------------------------------------------------------------

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  fill_in_blank: "Fill in Blank",
  matching: "Matching",
  ordering: "Ordering",
  audio_recording: "Audio Recording",
  free_text: "Free Text",
  video_recording: "Video Response",
};

function LessonExercises({
  lessonId,
  lessonTitle,
}: {
  lessonId: string;
  lessonTitle: string;
}) {
  const [exercises, setExercises] = useState<PracticeExercise[]>([]);
  const [practiceSetId, setPracticeSetId] = useState<string | null>(null);
  const [practiceSetStatus, setPracticeSetStatus] = useState<string>("draft");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<PracticeExercise | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const fetchExercises = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/audio-course/lessons/${lessonId}/exercises`,
      );
      const data = await res.json();
      setExercises(data.exercises ?? []);
      setPracticeSetId(data.practiceSetId ?? null);
      setPracticeSetStatus(data.practiceSetStatus ?? "draft");
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const handleSave = useCallback(
    (exercise: PracticeExercise) => {
      setExercises((prev) => {
        const idx = prev.findIndex((e) => e.id === exercise.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = exercise;
          return updated;
        }
        return [...prev, exercise];
      });
      setShowForm(false);
      setEditingExercise(null);
      // Refetch to get the practiceSetId if it was just created
      fetchExercises();
    },
    [fetchExercises],
  );

  const handleDelete = useCallback(
    async (exerciseId: string) => {
      if (!confirm("Delete this exercise?")) return;
      try {
        await fetch(
          `/api/admin/audio-course/lessons/${lessonId}/exercises`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exerciseId }),
          },
        );
        setExercises((prev) => prev.filter((e) => e.id !== exerciseId));
      } catch {
        // silent
      }
    },
    [lessonId],
  );

  const togglePublish = useCallback(async () => {
    setTogglingStatus(true);
    const newStatus = practiceSetStatus === "published" ? "draft" : "published";
    try {
      await fetch(
        `/api/admin/audio-course/lessons/${lessonId}/exercises-status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      setPracticeSetStatus(newStatus);
    } catch {
      // silent
    }
    setTogglingStatus(false);
  }, [lessonId, practiceSetStatus]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading exercises…
      </div>
    );
  }

  // If showing the form (create or edit)
  if (showForm || editingExercise) {
    // We need a practiceSetId for ExerciseForm. If we don't have one yet,
    // the POST handler will auto-create it. We use a placeholder and
    // intercept via onLocalSave.
    const formSetId = practiceSetId ?? "auto";

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">
            {editingExercise ? "Edit Exercise" : "New Exercise"} — {lessonTitle}
          </h4>
        </div>
        <ExerciseForm
          practiceSetId={formSetId}
          exercise={editingExercise ?? undefined}
          onSave={(exercise) => handleSave(exercise)}
          onCancel={() => {
            setShowForm(false);
            setEditingExercise(null);
          }}
          onLocalSave={
            !practiceSetId
              ? async (data) => {
                  // Auto-create via our lesson exercise API
                  try {
                    const res = await fetch(
                      `/api/admin/audio-course/lessons/${lessonId}/exercises`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(data),
                      },
                    );
                    const result = await res.json();
                    if (result.exercise) {
                      handleSave(result.exercise);
                    }
                  } catch {
                    // silent
                  }
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" />
          Exercises ({exercises.length})
          {practiceSetId && (
            <span
              className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                practiceSetStatus === "published"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-yellow-500/10 text-yellow-500"
              }`}
            >
              {practiceSetStatus}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-1.5">
          {practiceSetId && exercises.length > 0 && (
            <button
              type="button"
              disabled={togglingStatus}
              onClick={togglePublish}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                practiceSetStatus === "published"
                  ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                  : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
              }`}
            >
              {togglingStatus
                ? "…"
                : practiceSetStatus === "published"
                  ? "Unpublish"
                  : "Publish"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>

      {exercises.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No exercises yet. Add exercises for students to practice after listening.
        </p>
      ) : (
        <div className="space-y-1">
          {exercises.map((exercise, idx) => (
            <div
              key={exercise.id}
              className="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {EXERCISE_TYPE_LABELS[exercise.type] ?? exercise.type}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {getExercisePreview(exercise)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingExercise(exercise)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground text-[10px]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(exercise.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getExercisePreview(exercise: PracticeExercise): string {
  const def = exercise.definition as unknown as Record<string, unknown>;
  if (typeof def.question === "string") return def.question;
  if (typeof def.prompt === "string") return def.prompt;
  if (typeof def.sentence === "string") return def.sentence;
  if (typeof def.targetPhrase === "string") return def.targetPhrase;
  if (Array.isArray(def.items)) return `${def.items.length} items to order`;
  if (Array.isArray(def.pairs)) return `${def.pairs.length} pairs to match`;
  return "";
}
