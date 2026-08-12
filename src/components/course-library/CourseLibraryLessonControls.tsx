"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface CourseLibraryLessonControlsProps {
  lessonId: string;
  initialCompleted: boolean;
  nextHref?: string | null;
}

export function CourseLibraryLessonControls({
  lessonId,
  initialCompleted,
  nextHref = null,
}: CourseLibraryLessonControlsProps) {
  const router = useRouter();
  const [isComplete, setIsComplete] = useState(initialCompleted);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    // Mark the lesson as "last opened" so the course page can resume from here.
    fetch(`/api/course-library/lessons/${lessonId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touch: true }),
    }).catch(() => null);
  }, [lessonId]);

  const markComplete = (advance = false) => {
    if (isComplete) {
      if (advance && nextHref) router.push(nextHref);
      return;
    }
    setIsPending(true);
    void (async () => {
      const res = await fetch(`/api/course-library/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      if (res.ok) {
        setIsComplete(true);
        if (advance && nextHref) router.push(nextHref);
      }
      setIsPending(false);
    })();
  };

  if (isComplete) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Completed on this device account.</span>
        </div>
        {nextHref ? (
          <Button onClick={() => router.push(nextHref)} className="shrink-0 gap-2">
            Next lesson
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Mark this lesson complete</p>
        <p className="text-xs text-muted-foreground">
          Saves your place across desktop and mobile.
        </p>
      </div>
      <Button
        onClick={() => markComplete(Boolean(nextHref))}
        disabled={isPending}
        className="shrink-0 gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {nextHref ? "Complete & next" : "Complete"}
        {nextHref ? <ChevronRight className="h-4 w-4" /> : null}
      </Button>
    </div>
  );
}
