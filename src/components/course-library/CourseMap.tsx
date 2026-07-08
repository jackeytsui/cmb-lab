"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Lock, Trophy } from "lucide-react";
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

// Brand palette from the roadmap PDFs: dark-blue chapter lessons, light-blue
// CM School lessons, yellow Custom Goal stops.
const STYLE_META: Record<
  CourseMapStyle,
  { bg: string; shadow: string; ring: string }
> = {
  lesson: { bg: "#2e3a97", shadow: "#1f2870", ring: "rgba(46, 58, 151, 0.35)" },
  cm_school: { bg: "#4a9fe3", shadow: "#2f7fc2", ring: "rgba(74, 159, 227, 0.4)" },
  custom_goal: { bg: "#f2b705", shadow: "#c79403", ring: "rgba(242, 183, 5, 0.4)" },
};

const BRAND = "#2e3a97";
const MARK_URL = "/cmb-mark-white.png";

// Layout geometry (px).
const ROW_H = 128;
const PAD_TOP = 36; // room for the floating Start/Continue pill on the first row
const PAD_BOTTOM = 40; // room for labels under the last row
const DISC = 60;
const ZIG = 16; // horizontal zig-zag offset within a row

type StopState = "completed" | "current" | "unlocked" | "locked";

interface WeekBand {
  label: string | null;
  items: { stop: CourseMapStop; index: number }[];
}

/** Group consecutive stops into week bands. A stop with an empty weekLabel
 *  stays in the band opened by the last labelled stop. */
function groupByWeek(stops: CourseMapStop[]): WeekBand[] {
  const bands: WeekBand[] = [];
  let current: WeekBand | null = null;
  stops.forEach((stop, index) => {
    const label = stop.weekLabel?.trim() || null;
    if (!current || (label && label !== current.label)) {
      current = { label, items: [] };
      bands.push(current);
    }
    current.items.push({ stop, index });
  });
  return bands;
}

/** Columns for the snaking layout based on available width.
 *  Mobile (narrow) collapses to a single vertical column. */
function columnsFor(width: number): number {
  if (width === 0 || width < 680) return 1;
  return Math.min(6, Math.max(3, Math.floor(width / 190)));
}

// ---------------------------------------------------------------------------
// The CMB swoosh mark, tinted via CSS mask so it can be white or grey.
// ---------------------------------------------------------------------------
function BrandMark({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        WebkitMaskImage: `url(${MARK_URL})`,
        maskImage: `url(${MARK_URL})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        backgroundColor: color,
      }}
    />
  );
}

// Extract the week number from a band label like "Week 1" → 1. Non-week labels
// (e.g. "Day 1-3", "Bonus") return null and keep the logo chip header.
function parseWeekNumber(label: string): number | null {
  const m = /^\s*week\s*(\d+)\b/i.exec(label);
  return m ? parseInt(m[1], 10) : null;
}

// Section header: a bold brand number token for numbered weeks, or a
// logo-marked chip for non-numbered labels (e.g. "Day 1-3").
function BandHeader({ label }: { label: string }) {
  const weekNumber = parseWeekNumber(label);
  return (
    <div className="mb-1 mt-6 flex items-center gap-3">
      {weekNumber !== null ? (
        <div
          className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl text-white"
          style={{
            background: "linear-gradient(135deg, #2e3a97 0%, #3d4bb8 100%)",
            boxShadow: "0 4px 0 #1f2870",
          }}
        >
          <span className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-white/80">
            Week
          </span>
          <span className="text-2xl font-black leading-none">{weekNumber}</span>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-white"
          style={{
            background: "linear-gradient(135deg, #2e3a97 0%, #3d4bb8 100%)",
            boxShadow: "0 3px 0 #1f2870",
          }}
        >
          <BrandMark color="#ffffff" className="h-4 w-4" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide">
            {label}
          </h2>
        </div>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function StopNode({
  stop,
  courseId,
  state,
  onLockedTap,
}: {
  stop: CourseMapStop;
  courseId: string;
  state: StopState;
  onLockedTap: (stop: CourseMapStop) => void;
}) {
  const meta = STYLE_META[stop.mapStyle];
  const locked = state === "locked";
  const completed = state === "completed";
  const current = state === "current";
  const href = `/dashboard/course-library/${courseId}/modules/${stop.id}`;
  const label = stop.shortTitle?.trim() || stop.title;

  const disc = (
    <span className="relative block">
      {current && (
        <span
          className="absolute -inset-1.5 animate-pulse rounded-full"
          style={{ border: `3px solid ${meta.ring}` }}
        />
      )}
      {completed && (
        <span className="absolute -inset-1 rounded-full border-2 border-amber-400/90" />
      )}
      <span
        className="relative flex items-center justify-center rounded-full transition-transform duration-150 group-hover:-translate-y-0.5 group-active:translate-y-0.5"
        style={{
          height: DISC,
          width: DISC,
          background: locked ? "var(--muted)" : meta.bg,
          boxShadow: locked
            ? "0 4px 0 color-mix(in oklab, var(--muted-foreground) 30%, var(--muted))"
            : `0 5px 0 ${meta.shadow}`,
        }}
      >
        {completed ? (
          <Check className="h-7 w-7 text-white" strokeWidth={3} />
        ) : (
          <BrandMark
            color={locked ? "color-mix(in oklab, var(--muted-foreground) 70%, transparent)" : "#ffffff"}
            className="h-7 w-7"
          />
        )}
      </span>
      {locked && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
          <Lock className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
      )}
    </span>
  );

  const inner = (
    <>
      {current && (
        <span
          className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 animate-bounce whitespace-nowrap rounded-lg border-2 bg-background px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
          style={{ borderColor: meta.bg, color: meta.bg }}
        >
          {stop.completedCount > 0 ? "Continue" : "Start"}
        </span>
      )}
      {disc}
      <span
        className={cn(
          "mt-2 block text-center text-[11px] font-semibold leading-tight",
          locked ? "text-muted-foreground" : "text-foreground",
        )}
        style={{ maxWidth: 120 }}
      >
        {label}
      </span>
    </>
  );

  const commonClass =
    "group relative flex w-[124px] flex-col items-center outline-none";

  return locked ? (
    <button
      type="button"
      onClick={() => onLockedTap(stop)}
      aria-label={`${stop.title} (ahead of your progress)`}
      className={commonClass}
    >
      {inner}
    </button>
  ) : (
    <Link href={href} aria-label={stop.title} className={commonClass}>
      {inner}
    </Link>
  );
}

function BandGrid({
  band,
  columns,
  width,
  courseId,
  stateFor,
  onLockedTap,
}: {
  band: WeekBand;
  columns: number;
  width: number;
  courseId: string;
  stateFor: (index: number) => StopState;
  onLockedTap: (stop: CourseMapStop) => void;
}) {
  const n = band.items.length;
  const rows = Math.max(1, Math.ceil(n / columns));
  const cellW = width > 0 ? width / columns : 0;
  // Node centers sit at PAD_TOP + row*ROW_H + 46; leave room below the last
  // row for the disc and its label.
  const height = PAD_TOP + (rows - 1) * ROW_H + 46 + DISC / 2 + PAD_BOTTOM;

  // Serpentine (boustrophedon) coordinates for each item in the band.
  const points = band.items.map((_, k) => {
    const row = Math.floor(k / columns);
    const posInRow = k % columns;
    const col = row % 2 === 0 ? posInRow : columns - 1 - posInRow;
    const cx = cellW > 0 ? cellW * (col + 0.5) : 0;
    const zig = posInRow % 2 === 0 ? -ZIG : ZIG;
    const cy = PAD_TOP + row * ROW_H + 46 + zig;
    return { cx, cy, posInRow };
  });

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Dashed trail connecting the stops in order. */}
      {cellW > 0 && n > 1 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          fill="none"
        >
          {points.slice(0, -1).map((p, k) => {
            const q = points[k + 1];
            const mx = (p.cx + q.cx) / 2;
            const d = `M ${p.cx} ${p.cy} C ${mx} ${p.cy}, ${mx} ${q.cy}, ${q.cx} ${q.cy}`;
            const traveled = band.items[k].stop.isComplete;
            return traveled ? (
              <path
                key={k}
                d={d}
                stroke={BRAND}
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.85}
              />
            ) : (
              <path
                key={k}
                d={d}
                className="text-muted-foreground/40"
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="2 11"
              />
            );
          })}
        </svg>
      )}

      {/* Stop nodes. */}
      {band.items.map(({ stop, index }, k) => (
        <div
          key={stop.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: points[k].cx, top: points[k].cy }}
        >
          <StopNode
            stop={stop}
            courseId={courseId}
            state={stateFor(index)}
            onLockedTap={onLockedTap}
          />
        </div>
      ))}
    </div>
  );
}

export function CourseMap({ courseId, stops, currentIndex }: CourseMapProps) {
  const router = useRouter();
  const [jumpTarget, setJumpTarget] = useState<CourseMapStop | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allComplete = stops.length > 0 && currentIndex === -1;

  // Confetti the first time a student lands on a fully-completed course.
  useEffect(() => {
    if (!allComplete || typeof window === "undefined") return;
    const key = `cmb-map-done-${courseId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        confetti({
          particleCount: 130,
          spread: 75,
          origin: { y: 0.6 },
          colors: ["#2e3a97", "#4a9fe3", "#f2b705", "#ffffff"],
        });
      })
      .catch(() => {});
  }, [allComplete, courseId]);

  const bands = groupByWeek(stops);
  const columns = columnsFor(width);

  const stateFor = (index: number): StopState => {
    if (stops[index].isComplete) return "completed";
    if (index === currentIndex) return "current";
    if (currentIndex !== -1 && index > currentIndex) return "locked";
    return "unlocked";
  };

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-5xl">
      {bands.map((band, bandIdx) => (
        <section key={bandIdx}>
          {band.label && <BandHeader label={band.label} />}
          <BandGrid
            band={band}
            columns={columns}
            width={width}
            courseId={courseId}
            stateFor={stateFor}
            onLockedTap={setJumpTarget}
          />
        </section>
      ))}

      {/* Finish-line trophy. */}
      <div className="flex flex-col items-center pb-8 pt-2">
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            !allComplete && "grayscale",
          )}
          style={{
            height: 72,
            width: 72,
            background: allComplete ? "#f2b705" : "var(--muted)",
            boxShadow: allComplete
              ? "0 5px 0 #c79403"
              : "0 5px 0 color-mix(in oklab, var(--muted-foreground) 30%, var(--muted))",
          }}
        >
          <Trophy
            className={cn(
              "h-8 w-8",
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

      {/* Soft-lock confirmation. */}
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
