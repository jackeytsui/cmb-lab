"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Loader2,
  LocateFixed,
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

type LessonSummary = {
  id: string;
  title: string;
  lessonType: string;
  isComplete: boolean;
};

type ChapterSummary = {
  id: string;
  title: string;
  shortTitle: string | null;
  lessonCount: number;
  completedLessons: number;
  isComplete: boolean;
  isCurrent: boolean;
  lessons: LessonSummary[];
};

type CourseSummary = {
  id: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
  currentModuleId: string | null;
  currentLessonId: string | null;
  modules: ChapterSummary[];
};

type ProgressResponse = {
  courses?: CourseSummary[];
  result?: {
    action?: "set_next_lesson";
    courseTitle: string;
    targetModuleTitle: string;
    targetLessonTitle?: string;
    lessonsCompleted?: number;
    lessonsReopened?: number;
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

function selectionForCourse(course: CourseSummary | undefined) {
  if (!course) return { moduleId: "", lessonId: "" };

  const currentModule = course.modules.find((module) =>
    module.lessons.some((lesson) => lesson.id === course.currentLessonId),
  );
  const fallbackModule =
    currentModule ??
    course.modules.find((module) => module.lessons.length > 0) ??
    null;
  const fallbackLesson =
    fallbackModule?.lessons.find(
      (lesson) => lesson.id === course.currentLessonId,
    ) ?? fallbackModule?.lessons[0];

  return {
    moduleId: fallbackModule?.id ?? "",
    lessonId: fallbackLesson?.id ?? "",
  };
}

export function StudentCourseLibraryUnlock({ studentId, studentName }: Props) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
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
        const data = (await response.json()) as ProgressResponse;
        if (!response.ok) {
          throw new Error(data.error || "Failed to load Course Library progress");
        }

        const nextCourses = data.courses ?? [];
        const firstCourse = nextCourses[0];
        const selection = selectionForCourse(firstCourse);
        setCourses(nextCourses);
        setSelectedCourseId(firstCourse?.id ?? "");
        setSelectedModuleId(selection.moduleId);
        setSelectedLessonId(selection.lessonId);
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
  const selectedLesson =
    selectedModule?.lessons.find((lesson) => lesson.id === selectedLessonId) ??
    null;
  const orderedLessons =
    selectedCourse?.modules.flatMap((module) => module.lessons) ?? [];
  const selectedLessonIndex = orderedLessons.findIndex(
    (lesson) => lesson.id === selectedLessonId,
  );
  const lessonsToComplete =
    selectedLessonIndex >= 0
      ? orderedLessons
          .slice(0, selectedLessonIndex)
          .filter((lesson) => !lesson.isComplete).length
      : 0;
  const lessonsToReopen =
    selectedLessonIndex >= 0
      ? orderedLessons
          .slice(selectedLessonIndex)
          .filter((lesson) => lesson.isComplete).length
      : 0;
  const hasChanges = lessonsToComplete > 0 || lessonsToReopen > 0;

  const handleCourseChange = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    const selection = selectionForCourse(course);
    setSelectedCourseId(courseId);
    setSelectedModuleId(selection.moduleId);
    setSelectedLessonId(selection.lessonId);
  };

  const handleModuleChange = (moduleId: string) => {
    const chapter = selectedCourse?.modules.find((item) => item.id === moduleId);
    const lesson =
      chapter?.lessons.find((item) => !item.isComplete) ??
      chapter?.lessons[0];
    setSelectedModuleId(moduleId);
    setSelectedLessonId(lesson?.id ?? "");
  };

  const handleSetNextLesson = async () => {
    if (!selectedCourse || !selectedLesson || saving) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/students/${studentId}/course-library-unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_next_lesson",
            courseId: selectedCourse.id,
            targetLessonId: selectedLesson.id,
          }),
        },
      );
      const data = (await response.json()) as ProgressResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to update Course Library progress");
      }

      if (data.courses) setCourses(data.courses);
      setConfirmOpen(false);
      const completed = data.result?.lessonsCompleted ?? lessonsToComplete;
      const reopened = data.result?.lessonsReopened ?? lessonsToReopen;
      toast.success(
        `${selectedLesson.title} is now ${studentName}'s next lesson. ${completed} prerequisite lesson${completed === 1 ? "" : "s"} completed; ${reopened} lesson${reopened === 1 ? "" : "s"} reopened.`,
      );
    } catch (updateError) {
      toast.error(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update Course Library progress",
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
          visibility before changing progress.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LocateFixed className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">
              Set the student&apos;s next lesson
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Move forward to unlock content or move backward to resume an
              earlier lesson. CMB Lab adjusts only completion flags; quiz
              answers, submissions, recordings, notes, and viewing history are
              preserved.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Admin &amp; coach only
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
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
          Chapter
          <select
            value={selectedModuleId}
            onChange={(event) => handleModuleChange(event.target.value)}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {selectedCourse?.modules.map((chapter, index) => (
              <option
                key={chapter.id}
                value={chapter.id}
                disabled={chapter.lessonCount === 0}
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

        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Lesson to open next
          <select
            value={selectedLessonId}
            onChange={(event) => setSelectedLessonId(event.target.value)}
            disabled={!selectedModule || selectedModule.lessons.length === 0}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          >
            {selectedModule?.lessons.map((lesson, index) => (
              <option key={lesson.id} value={lesson.id}>
                {index + 1}. {lesson.title}
                {lesson.id === selectedCourse?.currentLessonId
                  ? " — next"
                  : lesson.isComplete
                    ? " — complete"
                    : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedCourse && selectedLesson ? (
        <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 px-4 py-3 text-sm md:grid-cols-3">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
            {selectedCourse.completedLessons} / {selectedCourse.totalLessons}{" "}
            lessons complete
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleDot className="size-4 text-primary" aria-hidden="true" />
            {lessonsToComplete} earlier lesson{lessonsToComplete === 1 ? "" : "s"}{" "}
            will be completed
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleDot className="size-4 text-amber-500" aria-hidden="true" />
            {lessonsToReopen} completed lesson{lessonsToReopen === 1 ? "" : "s"}{" "}
            will be reopened
          </span>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!selectedLesson || !hasChanges}
        >
          <LocateFixed aria-hidden="true" />
          {hasChanges ? "Set as next lesson" : "Already the next lesson"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set {selectedLesson?.title ?? "this lesson"} as next?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              This will complete {lessonsToComplete} unfinished prerequisite
              lesson{lessonsToComplete === 1 ? "" : "s"} and reopen{" "}
              {lessonsToReopen} completed lesson
              {lessonsToReopen === 1 ? "" : "s"} from the selected lesson
              onward for {studentName}. Existing quiz answers, submissions,
              recordings, notes, and viewing history will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void handleSetNextLesson();
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : <LocateFixed />}
              {saving ? "Updating…" : "Confirm next lesson"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
