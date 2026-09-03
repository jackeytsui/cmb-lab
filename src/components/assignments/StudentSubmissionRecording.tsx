"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface StudentSubmissionRecordingProps {
  src: string;
  sticky?: boolean;
}

interface PinnedLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

function scrollableAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY)) ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

export function StudentSubmissionRecording({
  src,
  sticky = false,
}: StudentSubmissionRecordingProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<HTMLElement>(null);
  const [pinnedLayout, setPinnedLayout] = useState<PinnedLayout | null>(null);

  useEffect(() => {
    if (!sticky) return;
    const anchor = anchorRef.current;
    const recording = recordingRef.current;
    if (!anchor || !recording) return;

    const ancestors = scrollableAncestors(anchor);
    const nearestScrollContainer = ancestors[0] ?? null;
    const dashboard = anchor.closest<HTMLElement>("[data-slot='sidebar-inset']");
    const dashboardHeader = dashboard?.querySelector<HTMLElement>("header") ?? null;
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      const anchorRect = anchor.getBoundingClientRect();
      const recordingRect = recording.getBoundingClientRect();
      const headerBottom = dashboardHeader?.getBoundingClientRect().bottom ?? 0;
      const scrollContainerTop =
        nearestScrollContainer?.getBoundingClientRect().top ?? 0;
      const top = Math.max(12, headerBottom + 12, scrollContainerTop + 12);
      const shouldPin = anchorRect.top <= top;

      setPinnedLayout((current) => {
        if (!shouldPin) return current === null ? current : null;
        const next = {
          top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: recordingRect.height,
        };
        if (
          current &&
          current.top === next.top &&
          current.left === next.left &&
          current.width === next.width &&
          current.height === next.height
        ) {
          return current;
        }
        return next;
      });
    };

    const scheduleMeasure = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    for (const ancestor of ancestors) {
      ancestor.addEventListener("scroll", scheduleMeasure, { passive: true });
    }
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(anchor);
    scheduleMeasure();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      for (const ancestor of ancestors) {
        ancestor.removeEventListener("scroll", scheduleMeasure);
      }
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver.disconnect();
    };
  }, [sticky]);

  return (
    <div
      ref={anchorRef}
      data-testid="student-submission-recording-anchor"
      style={pinnedLayout ? { height: pinnedLayout.height } : undefined}
    >
      <section
        ref={recordingRef}
        data-testid="student-submission-recording"
        data-sticky={sticky ? "true" : "false"}
        data-pinned={pinnedLayout ? "true" : "false"}
        style={
          pinnedLayout
            ? {
                top: pinnedLayout.top,
                left: pinnedLayout.left,
                width: pinnedLayout.width,
              }
            : undefined
        }
        className={cn(
          "rounded-lg border border-border bg-card p-5 shadow-sm",
          sticky && "border-primary/30 bg-card/95 backdrop-blur",
          pinnedLayout &&
            "fixed z-30 shadow-lg supports-[backdrop-filter]:bg-card/90",
        )}
        aria-labelledby="student-submission-recording-heading"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="student-submission-recording-heading"
            className="text-sm font-semibold text-foreground"
          >
            Student&apos;s recording
          </h2>
          {sticky && (
            <span className="text-[11px] text-muted-foreground">
              Stays visible while you review
            </span>
          )}
        </div>
        <audio
          controls
          preload="metadata"
          controlsList="nodownload"
          src={src}
          className="w-full"
        />
      </section>
    </div>
  );
}
