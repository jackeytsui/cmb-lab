"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, History, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  dismissCourseLibraryProgressRestore,
  restoreCourseLibraryProgressOnce,
} from "@/app/(dashboard)/dashboard/course-library/progress-restore-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { COMPLETE_COURSE_TARGET } from "@/lib/course-library-self-restore";

export type ProgressRestoreCourseOption = {
  id: string;
  title: string;
  currentlyLocked: boolean;
  completedLessons: number;
  totalLessons: number;
  modules: Array<{
    id: string;
    title: string;
    shortTitle: string | null;
    lessons: Array<{
      id: string;
      title: string;
    }>;
  }>;
};

type Props = {
  courses: ProgressRestoreCourseOption[];
};

function chapterLabel(module: ProgressRestoreCourseOption["modules"][number]) {
  return module.shortTitle?.trim() || module.title;
}

export function CourseLibraryProgressRestoreBanner({ courses }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const selectionCount = Object.values(selections).filter(Boolean).length;

  if (hidden || courses.length === 0) return null;

  const handleRestore = () => {
    if (selectionCount === 0 || isPending) return;

    startTransition(async () => {
      const result = await restoreCourseLibraryProgressOnce(
        Object.entries(selections)
          .filter(([, target]) => Boolean(target))
          .map(([courseId, target]) => ({ courseId, target })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setHidden(true);
      setRestoreOpen(false);
      const updates = [
        result.lessonsCompleted > 0
          ? `${result.lessonsCompleted} lesson${
              result.lessonsCompleted === 1 ? "" : "s"
            } marked complete`
          : null,
        result.coursesUnlocked > 0
          ? `${result.coursesUnlocked} Blueprint level${
              result.coursesUnlocked === 1 ? "" : "s"
            } unlocked`
          : null,
      ].filter(Boolean);
      toast.success(`Progress restored. ${updates.join(" and ")}.`);
      router.refresh();
    });
  };

  const handleDismiss = () => {
    if (isPending) return;

    startTransition(async () => {
      const result = await dismissCourseLibraryProgressRestore();
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setHidden(true);
      setDismissOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm">
        <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <History className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-foreground">
                Restore your migrated course progress
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Coming from GoHighLevel? You can use this once to choose the
                next lesson in each assigned course. Locked Blueprint levels are
                included; your existing work will stay intact.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => setRestoreOpen(true)}
          >
            Unlock the Courses
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Permanently dismiss progress restoration"
          onClick={() => setDismissOpen(true)}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </section>

      <Dialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!isPending) setRestoreOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Restore your Course Library progress</DialogTitle>
            <DialogDescription className="leading-6">
              This is available once. Select the lesson you should open next for
              any course that needs updating. Assigned courses appear here, and
              students enrolled in the full Canto to Mando Blueprint can choose
              Foundations, Intermediate, or Advanced even when a later level is
              currently locked. Progress can only move forward, and no answers,
              recordings, submissions, notes, or viewing history will be
              deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {courses.map((course) => (
              <div
                key={course.id}
                className="rounded-lg border border-border bg-muted/20 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`restore-course-${course.id}`}
                    className="font-medium text-foreground"
                  >
                    {course.title}
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {course.currentlyLocked ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">
                        Unlocks when confirmed
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2
                        className="size-3.5 text-emerald-500"
                        aria-hidden="true"
                      />
                      {course.completedLessons} / {course.totalLessons} complete
                    </span>
                  </div>
                </div>
                <select
                  id={`restore-course-${course.id}`}
                  value={selections[course.id] ?? ""}
                  onChange={(event) =>
                    setSelections((current) => ({
                      ...current,
                      [course.id]: event.target.value,
                    }))
                  }
                  className="mt-3 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">Keep my current progress</option>
                  {course.modules.map((module) => (
                    <optgroup key={module.id} label={chapterLabel(module)}>
                      {module.lessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          Next: {lesson.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={COMPLETE_COURSE_TARGET}>
                    I completed this entire course
                  </option>
                </select>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-100">
            Please check every selection carefully. After confirming, only an
            admin or coach can change these restored positions.
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setRestoreOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={selectionCount === 0 || isPending}
              onClick={handleRestore}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {isPending ? "Restoring…" : "Use my one-time restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this permanently?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              The progress restoration offer will not appear again, and your
              current course access and progress will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDismiss();
              }}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              {isPending ? "Dismissing…" : "Dismiss permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
