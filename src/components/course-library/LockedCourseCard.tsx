"use client";

import { useState } from "react";
import { BookOpen, Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LockedCourseCardProps {
  courseId: string;
  title: string;
  summary: string;
  levelLabel: string;
  hasCoverImage: boolean;
  /** Incomplete prerequisite levels, in order (e.g. ["Foundations", "Intermediate"]). */
  requiredLabels: string[];
}

/** "Foundations" / "Foundations and Intermediate" */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "the previous level";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Library card for a level the student hasn't unlocked yet: grayed out, does
 * not navigate, and clicking pops a prompt explaining which levels must be
 * completed first (Intermediate needs Foundations; Advanced needs Foundations
 * and Intermediate).
 */
export function LockedCourseCard({
  courseId,
  title,
  summary,
  levelLabel,
  hasCoverImage,
  requiredLabels,
}: LockedCourseCardProps) {
  const [open, setOpen] = useState(false);
  const required = joinLabels(requiredLabels);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} (locked — complete ${required} first)`}
        className="rounded-lg border border-border bg-card overflow-hidden text-left cursor-not-allowed"
      >
        <div className="aspect-video bg-muted relative">
          {hasCoverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/course-library/course-image/${courseId}`}
              alt={title}
              className="w-full h-full object-cover opacity-40 grayscale"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
              <BookOpen className="w-12 h-12" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-background/30">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/95 shadow">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </span>
          </div>
        </div>
        <div className="p-3 opacity-60">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1">
            {title}
          </h3>
          {summary && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {summary}
            </p>
          )}
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Lock className="w-3 h-3" />
            Complete {required} to unlock
          </p>
        </div>
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {levelLabel} is locked
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have to complete {required} to unlock {levelLabel}. Head back
              to your roadmap and finish the remaining lessons — this level
              opens automatically the moment you&apos;re done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setOpen(false)}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
