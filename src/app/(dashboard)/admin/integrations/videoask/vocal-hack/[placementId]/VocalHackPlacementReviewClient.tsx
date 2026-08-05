"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  Save,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PlacementDetail = {
  placement: {
    id: string;
    sourceTitle: string;
    sourceGroup: string;
    language: "mandarin" | "cantonese";
    targetCourseId: string | null;
    targetCourseTitle: string | null;
    targetModuleId: string | null;
    targetModuleTitle: string | null;
    targetLessonId: string | null;
    targetLessonTitle: string | null;
    publishedLessonId: string | null;
    action: string;
    confidence: string;
    mappingReason: string;
    instructions: string;
    status: string;
    totalSentences: number;
    readySentences: number;
    lastError: string | null;
  };
  sentences: Array<{
    id: string;
    sortOrder: number;
    videoUrl: string;
    sourceTranscript: string | null;
    chinese: string | null;
    pinyin: string | null;
    english: string | null;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
  catalog: {
    courses: Array<{
      id: string;
      title: string;
      status: string;
    }>;
    modules: Array<{
      id: string;
      courseId: string;
      title: string;
      sortOrder: number;
    }>;
    lessons: Array<{
      id: string;
      moduleId: string;
      title: string;
      lessonType: string;
      sortOrder: number;
    }>;
  };
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function humanStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function VocalHackPlacementReviewClient({
  placementId,
}: {
  placementId: string;
}) {
  const [detail, setDetail] = useState<PlacementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribedThisRun, setTranscribedThisRun] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const response = await fetch(
      `/api/admin/integrations/videoask/vocal-hack/placements/${placementId}`,
      { cache: "no-store" },
    );
    setDetail(await jsonResponse<PlacementDetail>(response));
  }, [placementId]);

  useEffect(() => {
    void loadDetail()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the placement",
        );
      })
      .finally(() => setLoading(false));
  }, [loadDetail]);

  const placement = detail?.placement;
  const modules = useMemo(
    () =>
      detail?.catalog.modules.filter(
        (module) => module.courseId === placement?.targetCourseId,
      ) ?? [],
    [detail?.catalog.modules, placement?.targetCourseId],
  );
  const lessons = useMemo(
    () =>
      detail?.catalog.lessons.filter(
        (lesson) => lesson.moduleId === placement?.targetModuleId,
      ) ?? [],
    [detail?.catalog.lessons, placement?.targetModuleId],
  );
  const isPublished = placement?.status === "published";
  const completeSentenceCount =
    detail?.sentences.filter(
      (sentence) =>
        sentence.chinese?.trim() &&
        sentence.pinyin?.trim() &&
        sentence.english?.trim(),
    ).length ?? 0;
  const readyToPublish = Boolean(
    placement?.targetCourseId &&
      placement.targetModuleId &&
      placement.targetLessonTitle?.trim() &&
      detail?.sentences.length &&
      completeSentenceCount === detail.sentences.length,
  );

  function updatePlacement(
    patch: Partial<PlacementDetail["placement"]>,
  ) {
    setDetail((current) =>
      current
        ? { ...current, placement: { ...current.placement, ...patch } }
        : current,
    );
  }

  function updateSentence(
    sentenceId: string,
    field: "chinese" | "pinyin" | "english",
    value: string,
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            sentences: current.sentences.map((sentence) =>
              sentence.id === sentenceId
                ? { ...sentence, [field]: value }
                : sentence,
            ),
          }
        : current,
    );
  }

  async function saveReview() {
    if (!detail) return null;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/videoask/vocal-hack/placements/${placementId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetCourseId: detail.placement.targetCourseId,
            targetModuleId: detail.placement.targetModuleId,
            targetLessonId: detail.placement.targetLessonId,
            targetLessonTitle: detail.placement.targetLessonTitle,
            instructions: detail.placement.instructions,
            sentences: detail.sentences.map((sentence) => ({
              id: sentence.id,
              chinese: sentence.chinese ?? "",
              pinyin: sentence.pinyin ?? "",
              english: sentence.english ?? "",
            })),
          }),
        },
      );
      const saved = await jsonResponse<PlacementDetail>(response);
      setDetail(saved);
      return saved;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save review",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function transcribePlacement() {
    if (!detail?.placement.targetModuleId) {
      setError("Choose and save a destination module before transcription.");
      return;
    }
    const approved = window.confirm(
      "Send this placement's missing coach-video clips to OpenAI for Chinese " +
        "speech-to-text and English translation? This only updates staging.",
    );
    if (!approved) return;
    const saved = await saveReview();
    if (!saved) return;

    setTranscribing(true);
    setTranscribedThisRun(0);
    setError(null);
    try {
      const queueResponse = await fetch(
        "/api/admin/integrations/videoask/vocal-hack/queue",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placementIds: [placementId] }),
        },
      );
      await jsonResponse<{ result: { sentences: number } }>(queueResponse);
      let processed = 0;
      while (true) {
        const response = await fetch(
          "/api/admin/integrations/videoask/vocal-hack/process",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placementId }),
          },
        );
        const payload = await jsonResponse<{
          result: {
            status: "empty" | "ready" | "failed";
            remaining?: number;
            error?: string;
          };
        }>(response);
        if (payload.result.status === "empty") {
          if ((payload.result.remaining ?? 0) > 0) {
            setError(
              `${payload.result.remaining} sentence(s) still need manual review or retry.`,
            );
          }
          break;
        }
        processed += 1;
        setTranscribedThisRun(processed);
      }
      await loadDetail();
    } catch (transcriptionError) {
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "AI transcription paused",
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function publishPlacement() {
    if (!detail || !readyToPublish) return;
    const saved = await saveReview();
    if (!saved || saved.placement.status !== "ready_for_review") return;
    const destination = `${saved.placement.targetCourseTitle ?? "selected course"} → ${saved.placement.targetModuleTitle ?? "selected module"} → ${saved.placement.targetLessonTitle}`;
    const action = saved.placement.targetLessonId
      ? "replace the selected existing lesson"
      : "create a new lesson";
    if (
      !window.confirm(
        `Publish now? This will ${action} at:\n\n${destination}\n\nThis is the first step that changes the live Course Library.`,
      )
    ) {
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/videoask/vocal-hack/placements/${placementId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = await jsonResponse<{
        result: { lessonUrl: string };
      }>(response);
      setPublishedUrl(payload.result.lessonUrl);
      await loadDetail();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Could not publish this lesson",
      );
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading review…
      </div>
    );
  }
  if (!detail || !placement) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link href="/admin/integrations/videoask">
            <ArrowLeft /> Back to VideoAsk
          </Link>
        </Button>
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          {error || "Placement not found"}
        </p>
      </div>
    );
  }

  const romanisationLabel =
    placement.language === "cantonese" ? "Jyutping" : "Pinyin";

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" className="mb-3 -ml-3">
          <Link href="/admin/integrations/videoask">
            <ArrowLeft /> Back to VideoAsk
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {placement.sourceGroup} · {placement.language}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{placement.sourceTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {placement.mappingReason}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-sm capitalize">
            {humanStatus(placement.status)}
          </span>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {publishedUrl ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Published successfully.
          <Link href={publishedUrl} className="inline-flex items-center gap-1 underline">
            Open lesson <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Confirm CMB Lab destination</CardTitle>
          <CardDescription>
            Choose an existing placeholder to replace, or create a new Vocal
            Hack lesson at the end of the selected module.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Course</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={placement.targetCourseId ?? ""}
              disabled={isPublished}
              onChange={(event) =>
                updatePlacement({
                  targetCourseId: event.target.value || null,
                  targetCourseTitle:
                    detail.catalog.courses.find(
                      (course) => course.id === event.target.value,
                    )?.title ?? null,
                  targetModuleId: null,
                  targetModuleTitle: null,
                  targetLessonId: null,
                })
              }
            >
              <option value="">Choose a course…</option>
              {detail.catalog.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} ({course.status})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Module</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={placement.targetModuleId ?? ""}
              disabled={isPublished || !placement.targetCourseId}
              onChange={(event) =>
                updatePlacement({
                  targetModuleId: event.target.value || null,
                  targetModuleTitle:
                    modules.find((module) => module.id === event.target.value)
                      ?.title ?? null,
                  targetLessonId: null,
                })
              }
            >
              <option value="">Choose a module…</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Existing lesson</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={placement.targetLessonId ?? ""}
              disabled={isPublished || !placement.targetModuleId}
              onChange={(event) => {
                const lesson = lessons.find(
                  (candidate) => candidate.id === event.target.value,
                );
                updatePlacement({
                  targetLessonId: lesson?.id ?? null,
                  targetLessonTitle:
                    lesson?.title ?? placement.targetLessonTitle,
                });
              }}
            >
              <option value="">Create a new lesson</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  Replace: {lesson.title} ({lesson.lessonType})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Lesson title</span>
            <input
              className="h-10 rounded-md border bg-background px-3"
              value={placement.targetLessonTitle ?? ""}
              disabled={isPublished}
              onChange={(event) =>
                updatePlacement({ targetLessonTitle: event.target.value })
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm md:col-span-2">
            <span className="font-medium">Student instructions (HTML)</span>
            <textarea
              className="min-h-28 rounded-md border bg-background p-3 font-mono text-xs"
              value={placement.instructions}
              disabled={isPublished}
              onChange={(event) =>
                updatePlacement({ instructions: event.target.value })
              }
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>2. Review sentence videos and text</span>
            {!isPublished ? (
              <Button
                type="button"
                variant="outline"
                onClick={transcribePlacement}
                disabled={transcribing || saving || !placement.targetModuleId}
              >
                {transcribing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                {transcribing
                  ? `Transcribing… ${transcribedThisRun}`
                  : "AI transcribe missing rows"}
              </Button>
            ) : null}
          </CardTitle>
          <CardDescription>
            One VideoAsk clip becomes one sentence row. Repeated demonstrations
            inside a clip should appear once in the Chinese field.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.sentences.map((sentence, index) => (
            <div
              key={sentence.id}
              className="grid gap-4 rounded-lg border p-4 lg:grid-cols-[18rem_1fr]"
            >
              <div>
                <p className="mb-2 text-sm font-semibold">
                  Sentence {index + 1}
                </p>
                <video
                  controls
                  preload="metadata"
                  className="aspect-video w-full rounded-md bg-black"
                  src={`/api/admin/course-library/blob-preview?url=${encodeURIComponent(sentence.videoUrl)}`}
                />
                <p className="mt-2 text-xs capitalize text-muted-foreground">
                  {humanStatus(sentence.status)} · attempt {sentence.attempts}
                </p>
                {sentence.sourceTranscript ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Raw AI transcript: {sentence.sourceTranscript}
                  </p>
                ) : null}
                {sentence.lastError ? (
                  <p className="mt-2 text-xs text-destructive">
                    {sentence.lastError}
                  </p>
                ) : null}
              </div>
              <div className="grid content-start gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Chinese</span>
                  <input
                    className="h-10 rounded-md border bg-background px-3 text-lg"
                    value={sentence.chinese ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSentence(sentence.id, "chinese", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{romanisationLabel}</span>
                  <input
                    className="h-10 rounded-md border bg-background px-3"
                    value={sentence.pinyin ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSentence(sentence.id, "pinyin", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">English</span>
                  <input
                    className="h-10 rounded-md border bg-background px-3"
                    value={sentence.english ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSentence(sentence.id, "english", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Save, then publish explicitly</CardTitle>
          <CardDescription>
            Saving updates staging only. Publishing atomically replaces the
            selected placeholder or creates the new sibling lesson.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {!isPublished ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void saveReview()}
                disabled={saving || publishing || transcribing}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save review draft
              </Button>
              <Button
                type="button"
                onClick={publishPlacement}
                disabled={
                  !readyToPublish || saving || publishing || transcribing
                }
              >
                {publishing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )}
                Publish this Vocal Hack
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Published
              </span>
              {placement.targetCourseId && placement.publishedLessonId ? (
                <Button asChild variant="outline">
                  <Link
                    href={`/admin/course-library/${placement.targetCourseId}/lessons/${placement.publishedLessonId}`}
                  >
                    Open CMB Lab lesson <ExternalLink />
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {completeSentenceCount}/{detail.sentences.length} sentence rows are
            complete.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
