"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Star, MessagesSquare, Flag, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
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

export type CourseMapStyle = "lesson" | "cm_school" | "custom_goal";

export interface CourseMapStop {
  id: string;
  title: string;
  shortTitle: string | null;
  mapStyle: CourseMapStyle;
  weekLabel: string | null;
  lessonCount: number;
  completedCount: number;
  isComplete: boolean;
}

interface CourseMapProps {
  courseId: string;
  stops: CourseMapStop[];
  /** Index of the stop the student should do next; -1 when all complete. */
  currentIndex: number;
}

// Brand colors from the roadmap PDFs: dark blue chapter lessons, light blue
// CM School lessons, yellow Custom Goal stops.
const STYLE_META: Record<
  CourseMapStyle,
  { bg: string; shadow: string; ring: string; Icon: typeof Star }
> = {
  lesson: {
    bg: "#2e3a97",
    shadow: "#1f2870",
    ring: "rgba(46, 58, 151, 0.35)",
    Icon: Star,
  },
  cm_school: {
    bg: "#4a9fe3",
    shadow: "#2f7fc2",
    ring: "rgba(74, 159, 227, 0.4)",
    Icon: MessagesSquare,
  },
  custom_goal: {
    bg: "#f2b705",
    shadow: "#c79403",
    ring: "rgba(242, 183, 5, 0.4)",
    Icon: Flag,
  },
};

// Horizontal serpentine offsets (px), cycled by position along the path.
const OFFSETS = [0, 44, 70, 44, 0, -44, -70, -44];

interface WeekGroup {
  label: string | null;
  stops: { stop: CourseMapStop; index: number }[];
}

/** Group consecutive stops into week bands. A stop with an empty weekLabel
 *  stays in the band opened by the last labelled stop. */
function groupByWeek(stops: CourseMapStop[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let current: WeekGroup | null = null;
  stops.forEach((stop, index) => {
    const label = stop.weekLabel?.trim() || null;
    if (!current || (label && label !== current.label)) {
      current = { label, stops: [] };
      groups.push(current);
    }
    current.stops.push({ stop, index });
  });
  return groups;
}

type StopState = "completed" | "current" | "unlocked" | "locked";

function StopNode({
  stop,
  index,
  courseId,
  state,
  onLockedTap,
}: {
  stop: CourseMapStop;
  index: number;
  courseId: string;
  state: StopState;
  onLockedTap: (stop: CourseMapStop) => void;
}) {
  const meta = STYLE_META[stop.mapStyle];
  const Icon = state === "completed" ? Check : meta.Icon;
  const offset = OFFSETS[index % OFFSETS.length];
  const href = `/dashboard/course-library/${courseId}/modules/${stop.id}`;
  const label = stop.shortTitle?.trim() || stop.title;
  const locked = state === "locked";

  const circle = (
    <span
      className={cn(
        "relative flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:translate-y-1",
        locked && "grayscale",
      )}
      style={{
        background: locked ? "var(--muted)" : meta.bg,
        boxShadow: locked
          ? "0 6px 0 color-mix(in oklab, var(--muted-foreground) 35%, var(--muted))"
          : `0 6px 0 ${meta.shadow}`,
      }}
    >
      {state === "current" && (
        <span
          className="absolute -inset-2 animate-pulse rounded-full"
          style={{ border: `4px solid ${meta.ring}` }}
        />
      )}
      <Icon
        className={cn(
          "h-7 w-7",
          locked ? "text-muted-foreground/60" : "text-white",
        )}
        strokeWidth={2.5}
        fill={state === "completed" || stop.mapStyle !== "cm_school" ? "currentColor" : "none"}
      />
      {locked && (
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
          <Lock className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
      {state === "completed" && (
        <span className="absolute -inset-1 rounded-full border-2 border-amber-400/80" />
      )}
    </span>
  );

  const content = (
    <>
      {state === "current" && (
        <span
          className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 animate-bounce whitespace-nowrap rounded-xl border-2 bg-background px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
          style={{ borderColor: meta.bg, color: meta.bg }}
        >
          {stop.completedCount > 0 ? "Continue" : "Start"}
        </span>
      )}
      {circle}
      <span
        className={cn(
          "mt-2 block max-w-[130px] text-center text-xs font-semibold leading-tight",
          locked ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {label}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "relative flex justify-center py-4",
        // Leave room for the floating Start/Continue bubble.
        state === "current" && "mt-8",
      )}
      style={{ transform: `translateX(${offset}px)` }}
    >
      {locked ? (
        <button
          type="button"
          onClick={() => onLockedTap(stop)}
          aria-label={`${stop.title} (ahead of your progress)`}
          className="relative flex flex-col items-center"
        >
          {content}
        </button>
      ) : (
        <Link
          href={href}
          aria-label={stop.title}
          className="relative flex flex-col items-center"
        >
          {content}
        </Link>
      )}
    </div>
  );
}

export function CourseMap({ courseId, stops, currentIndex }: CourseMapProps) {
  const router = useRouter();
  const [jumpTarget, setJumpTarget] = useState<CourseMapStop | null>(null);

  const groups = groupByWeek(stops);
  const allComplete = stops.length > 0 && currentIndex === -1;

  const stateFor = (index: number): StopState => {
    if (stops[index].isComplete) return "completed";
    if (index === currentIndex) return "current";
    // Stops past the current one look locked (soft lock); anything at or
    // before it — e.g. a stop with no subpages yet — stays freely tappable.
    if (currentIndex !== -1 && index > currentIndex) return "locked";
    return "unlocked";
  };

  return (
    <div className="mx-auto max-w-md">
      {groups.map((group, groupIdx) => (
        <section key={groupIdx}>
          {group.label && (
            <div
              className="my-6 flex items-center justify-center rounded-2xl px-4 py-3 text-white shadow-sm"
              style={{
                background: "linear-gradient(135deg, #2e3a97 0%, #3d4bb8 100%)",
                boxShadow: "0 4px 0 #1f2870",
              }}
            >
              <h2 className="text-base font-extrabold uppercase tracking-wide">
                {group.label}
              </h2>
            </div>
          )}
          <div>
            {group.stops.map(({ stop, index }) => (
              <StopNode
                key={stop.id}
                stop={stop}
                index={index}
                courseId={courseId}
                state={stateFor(index)}
                onLockedTap={setJumpTarget}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Finish-line trophy */}
      <div className="flex flex-col items-center py-8">
        <span
          className={cn(
            "flex h-[76px] w-[76px] items-center justify-center rounded-full",
            !allComplete && "grayscale",
          )}
          style={{
            background: allComplete ? "#f2b705" : "var(--muted)",
            boxShadow: allComplete
              ? "0 6px 0 #c79403"
              : "0 6px 0 color-mix(in oklab, var(--muted-foreground) 35%, var(--muted))",
          }}
        >
          <Trophy
            className={cn(
              "h-9 w-9",
              allComplete ? "text-white" : "text-muted-foreground/60",
            )}
            strokeWidth={2.5}
          />
        </span>
        <p className="mt-3 max-w-[240px] text-center text-sm font-semibold text-foreground">
          {allComplete
            ? "Congratulations on completing this section!"
            : "Complete every stop to finish this section"}
        </p>
      </div>

      {/* Soft-lock confirmation */}
      <AlertDialog
        open={jumpTarget !== null}
        onOpenChange={(open) => !open && setJumpTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jumping ahead?</AlertDialogTitle>
            <AlertDialogDescription>
              {jumpTarget
                ? `"${jumpTarget.title}" is further along the roadmap. We recommend following the stops in order, but you can jump ahead if you like.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (jumpTarget) {
                  router.push(
                    `/dashboard/course-library/${courseId}/modules/${jumpTarget.id}`,
                  );
                }
              }}
            >
              Jump ahead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
