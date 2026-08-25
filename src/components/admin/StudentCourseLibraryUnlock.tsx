"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Loader2,
  LockOpen,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ChapterSummary = {
  id: string;
  title: string;
  shortTitle: string | null;
  lessonCount: number;
  completedLessons: number;
  isComplete: boolean;
  isCurrent: boolean;
};

type CourseSummary = {
  id: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
  currentModuleId: string | null;
  modules: ChapterSummary[];
};

type UnlockResponse = {
  courses?: CourseSummary[];
  result?: {
    courseTitle: string;
    targetModuleTitle: string;
    lessonsChanged: number;
    lessonsAlreadyComplete: number;
  };
  error?: string;
};

type Props = {
  studentId: string;
  studentName: string;
};

function chapterLabel(chapter: ChapterSummary) {
  return chapter.shortTitle?.trim() || chapter.title;
}

export function StudentCourseLibraryUnlock({ studentId, studentName }: Props) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadProgress = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/students/${studentId}/course-library-unlock`,
          { signal },
        );
        const data = (await response.json()) as UnlockResponse;
        if (!response.ok) {
          throw new Error(data.error || "Failed to load Course Library progress");
        }

        const nextCourses = data.courses ?? [];
        setCourses(nextCourses);
        const firstCourse = nextCourses[0];
        setSelectedCourseId(firstCourse?.id ?? "");
        setSelectedModuleId(
          firstCourse?.currentModuleId ?? firstCourse?.modules[0]?.id ?? "",
        );
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Course Library progress",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [studentId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadProgress(controller.signal);
    return () => controller.abort();
  }, [loadProgress]);

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? null;
  const selectedModule =
    selectedCourse?.modules.find((module) => module.id === selectedModuleId) ??
    null;
  const selectedModuleIndex = selectedCourse?.modules.findIndex(
    (module) => module.id === selectedModuleId,
  ) ?? -1;
  const lessonsToComplete =
    selectedCourse && selectedModuleIndex > 0
      ? selectedCourse.modules
          .slice(0, selectedModuleIndex)
          .reduce(
            (total, module) =>
              total + Math.max(0, module.lessonCount - module.completedLessons),
            0,
          )
      : 0;

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    const course = courses.find((item) => item.id === courseId);
    setSelectedModuleId(
      course?.currentModuleId ?? course?.modules[0]?.id ?? "",
    );
  };

  const handleUnlock = async () => {
    if (!selectedCourse || !selectedModule || saving) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/students/${studentId}/course-library-unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: selectedCourse.id,
            targetModuleId: selectedModule.id,
          }),
        },
      );
      const data = (await response.json()) as UnlockResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to unlock chapter");
      }

      if (data.courses) setCourses(data.courses);
      setConfirmOpen(false);
      const changed = data.result?.lessonsChanged ?? 0;
      toast.success(
        changed > 0
          ? `${chapterLabel(selectedModule)} unlocked for ${studentName}. ${changed} prerequisite lesson${changed === 1 ? "" : "s"} completed.`
          : `${chapterLabel(selectedModule)} was already unlocked for ${studentName}.`,
      );
    } catch (unlockError) {
      toast.error(
        unlockError instanceof Error
          ? unlockError.message
          : "Failed to unlock chapter",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading roadmap progress…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void loadProgress()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <BookOpenCheck className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">
          No assigned Course Library courses
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign a published course through the student&apos;s tags or course
          visibility before setting a chapter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockOpen className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">
              Set the student&apos;s next chapter
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Choose the chapter {studentName} should open next. CMB Lab will
              complete only unfinished prerequisite lessons; the selected
              chapter remains current and incomplete.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Admin &amp; coach only
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Course
          <select
            value={selectedCourseId}
            onChange={(event) => handleCourseChange(event.target.value)}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Chapter to open next
          <select
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {selectedCourse?.modules.map((chapter, index) => (
              <option
                key={chapter.id}
                value={chapter.id}
                disabled={chapter.lessonCount === 0 || chapter.isComplete}
              >
                {index + 1}. {chapterLabel(chapter)}
                {chapter.lessonCount === 0
                  ? " — no lessons"
                  : chapter.isComplete
                    ? " — complete"
                    : chapter.isCurrent
                      ? " — current"
                      : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedCourse ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/40 px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
            {selectedCourse.completedLessons} / {selectedCourse.totalLessons}
            {" "}lessons complete
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleDot className="size-4 text-primary" aria-hidden="true" />
            {lessonsToComplete > 0
              ? `${lessonsToComplete} prerequisite lesson${lessonsToComplete === 1 ? "" : "s"} will be completed`
              : "This chapter is already available"}
          </span>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!selectedModule || lessonsToComplete === 0}
        >
          <LockOpen aria-hidden="true" />
          {lessonsToComplete === 0 ? "Already unlocked" : "Unlock chapter"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlock {selectedModule ? chapterLabel(selectedModule) : "chapter"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              This will mark {lessonsToComplete} unfinished prerequisite lesson
              {lessonsToComplete === 1 ? "" : "s"} complete for {studentName}.
              The selected chapter stays incomplete and becomes their next stop.
              Existing quiz, video, and assignment data will not be overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void handleUnlock();
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : <LockOpen />}
              {saving ? "Unlocking…" : "Confirm unlock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
