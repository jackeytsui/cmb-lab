"use client";

import Link from "next/link";
import { BookOpen, Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type CourseLibraryCourseCardProps = {
  courseId: string;
  title: string;
  summary: string | null;
  coverImageSrc: string | null;
  completedLessons: number;
  totalLessons: number;
  percent: number;
  locked: boolean;
  unlockRequirement: string | null;
};

function CourseCardBody({
  title,
  summary,
  coverImageSrc,
  completedLessons,
  totalLessons,
  percent,
  locked,
  unlockRequirement,
}: Omit<CourseLibraryCourseCardProps, "courseId">) {
  return (
    <>
      <div className="aspect-video bg-muted relative overflow-hidden">
        {coverImageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageSrc}
            alt={title}
            className={cn(
              "h-full w-full object-cover transition-transform group-hover:scale-[1.01]",
              locked && "grayscale opacity-45",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <BookOpen className="h-12 w-12" />
          </div>
        )}
        {locked ? (
          <>
            <div className="absolute inset-0 bg-background/35" />
            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Locked
            </span>
          </>
        ) : null}
      </div>
      <div className="p-3">
        <h2
          className={cn(
            "line-clamp-1 text-sm font-semibold",
            locked ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {title}
        </h2>
        {summary ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {summary}
          </p>
        ) : null}
        {locked ? (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-muted px-2.5 py-2 text-left text-xs font-medium text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{unlockRequirement}</span>
          </div>
        ) : (
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {completedLessons} of {totalLessons} done
              </span>
              <span>{percent}%</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function CourseLibraryCourseCard(props: CourseLibraryCourseCardProps) {
  const cardClassName = cn(
    "group block w-full overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    props.locked
      ? "border-border/70 bg-muted/20 hover:border-border"
      : "border-border bg-card hover:border-primary/40",
  );
  const body = <CourseCardBody {...props} />;

  if (!props.locked) {
    return (
      <Link
        href={`/dashboard/course-library/${props.courseId}`}
        className={cardClassName}
      >
        {body}
      </Link>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cardClassName}
          aria-label={`${props.title} is locked. ${props.unlockRequirement}`}
        >
          {body}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Lock aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{props.title} is locked</AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            {props.unlockRequirement} It will unlock automatically when you
            finish the prerequisite course.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
