"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type WalkthroughStep = {
  id: string;
  title: string;
  description: string;
  target: string;
  placement?: "top" | "bottom";
  completed?: boolean;
  blockedMessage?: string;
  requireTargetVisible?: boolean;
  strictTarget?: boolean;
  autoAdvanceOnComplete?: boolean;
  allowClickSelectors?: string[];
  bubbleOffsetY?: number;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ProductWalkthrough({
  steps,
  storageKey,
  enabled,
  autoStart = true,
  runToken = 0,
  markDoneOnFinish = true,
  onFinish,
  stepOffset = 0,
  totalSteps,
  actionSignals,
  onStepChange,
}: {
  steps: WalkthroughStep[];
  storageKey: string;
  enabled: boolean;
  autoStart?: boolean;
  runToken?: number;
  markDoneOnFinish?: boolean;
  onFinish?: () => void;
  stepOffset?: number;
  totalSteps?: number;
  actionSignals?: Record<string, number>;
  onStepChange?: (
    step: WalkthroughStep,
    index: number,
    direction: "start" | "forward" | "back",
  ) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [missingTargetAttempts, setMissingTargetAttempts] = useState(0);
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const autoAdvancedStepRef = useRef<Record<string, boolean>>({});
  const previousIndexRef = useRef<number | null>(null);
  const suppressAutoAdvanceForIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !autoStart || typeof window === "undefined") return;
    const completed = window.localStorage.getItem(storageKey) === "done";
    if (!completed) {
      autoAdvancedStepRef.current = {};
      previousIndexRef.current = null;
      setShowSkipConfirm(false);
      setCurrentIndex(0);
      setIsOpen(true);
    }
  }, [autoStart, enabled, storageKey]);

  useEffect(() => {
    if (!enabled || runToken === 0) return;
    autoAdvancedStepRef.current = {};
    previousIndexRef.current = null;
    setShowSkipConfirm(false);
    setCurrentIndex(0);
    setIsOpen(true);
  }, [enabled, runToken]);

  const currentStep = steps[currentIndex] ?? null;
  const displayedTotal = totalSteps ?? steps.length;
  const displayedStep = stepOffset + currentIndex + 1;

  useEffect(() => {
    if (!isOpen) return;
    const step = steps[currentIndex];
    if (!step) return;
    const previousIndex = previousIndexRef.current;
    if (previousIndex === currentIndex) return;
    const direction =
      previousIndex === null
        ? "start"
        : currentIndex > previousIndex
          ? "forward"
          : "back";
    previousIndexRef.current = currentIndex;
    onStepChange?.(step, currentIndex, direction);
  }, [currentIndex, isOpen, onStepChange, steps]);

  useEffect(() => {
    setTargetRect(null);
    setMissingTargetAttempts(0);
    setHasAutoScrolled(false);
    setShowSkipConfirm(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen || !currentStep) return;

    const updateRect = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const isOutOfView =
        rect.top < 80 ||
        rect.bottom > window.innerHeight - 80;
      if (isOutOfView && !hasAutoScrolled) {
        setHasAutoScrolled(true);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updateRect();
    const intervalId = window.setInterval(updateRect, 100);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, hasAutoScrolled, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentStep || targetRect) return;
    const delay = currentStep.strictTarget ? 180 : 120;
    const timer = window.setTimeout(() => {
      setMissingTargetAttempts((prev) => prev + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentStep, isOpen, targetRect]);

  const closeAndMarkDone = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "done");
    }
    setShowSkipConfirm(false);
    setIsOpen(false);
  };

  const bubblePosition = useMemo(() => {
    if (!targetRect || !currentStep) return null;
    if (typeof window === "undefined") return null;
    const bubbleWidth = 320;
    const margin = 12;
    const left = clamp(
      targetRect.left + targetRect.width / 2 - bubbleWidth / 2,
      margin,
      window.innerWidth - bubbleWidth - margin,
    );

    const wantsTop = currentStep.placement === "top";
    const offsetY = currentStep.bubbleOffsetY ?? 0;
    const proposedTop = wantsTop
      ? targetRect.top - 12 - 150 + offsetY
      : targetRect.top + targetRect.height + 12 + offsetY;
    const top = clamp(proposedTop, margin, window.innerHeight - 170);

    return { top, left };
  }, [currentStep, targetRect]);

  const isLast = currentIndex === steps.length - 1;
  const hasTarget = Boolean(targetRect && bubblePosition);
  const safeRect = targetRect ?? { top: 0, left: 0, width: 0, height: 0 };
  const safeBubble = bubblePosition ?? { top: 16, left: 0 };

  const targetBottom = targetRect ? targetRect.top + targetRect.height : 0;
  const targetRight = targetRect ? targetRect.left + targetRect.width : 0;
  const targetVisible =
    (targetRect?.top ?? -1) >= 0 &&
    targetBottom <= window.innerHeight &&
    (targetRect?.left ?? -1) >= 0 &&
    targetRight <= window.innerWidth;
  const baseCompleted = currentStep?.completed ?? true;
  const requiresVisibility = currentStep?.requireTargetVisible ?? false;
  const canProceed = baseCompleted && (!requiresVisibility || targetVisible);
  const visibilityMessage =
    requiresVisibility && !targetVisible
      ? "Please view the highlighted area before continuing."
      : null;

  useEffect(() => {
    if (!isOpen || !currentStep || !currentStep.autoAdvanceOnComplete) return;
    if (suppressAutoAdvanceForIndexRef.current === currentIndex) {
      suppressAutoAdvanceForIndexRef.current = null;
      return;
    }
    if (!canProceed) return;

    const key = `${currentIndex}:${currentStep.id}`;
    if (autoAdvancedStepRef.current[key]) return;
    autoAdvancedStepRef.current[key] = true;

    if (currentIndex === steps.length - 1) {
      if (markDoneOnFinish) {
        closeAndMarkDone();
      } else {
        setIsOpen(false);
      }
      onFinish?.();
      return;
    }
    setCurrentIndex((prev) => prev + 1);
  }, [
    canProceed,
    currentIndex,
    currentStep,
    isOpen,
    markDoneOnFinish,
    onFinish,
    steps.length,
  ]);

  useEffect(() => {
    if (!enabled || !isOpen || !currentStep) return;

    const handler = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;

      const bubbleEl = bubbleRef.current;
      if (bubbleEl && bubbleEl.contains(target)) return;

      const allowedTarget = document.querySelector(currentStep.target) as HTMLElement | null;
      if (allowedTarget && allowedTarget.contains(target)) return;
      const extraAllowed = currentStep.allowClickSelectors ?? [];
      for (const selector of extraAllowed) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && el.contains(target)) return;
      }

      event.preventDefault();
      event.stopPropagation();
      // Prevent bubbling listeners from firing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event as any).stopImmediatePropagation?.();
    };

    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("click", handler, true);
    document.addEventListener("touchstart", handler, true);

    return () => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("click", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [currentStep, enabled, isOpen]);

  if (!enabled || !isOpen || !currentStep) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/35" />
      {hasTarget && (
        <>
          <div
            className="absolute rounded-xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-all"
            style={{
              top: safeRect.top - 4,
              left: safeRect.left - 4,
              width: safeRect.width + 8,
              height: safeRect.height + 8,
            }}
          />
          <div
            className="absolute rounded-xl border-2 border-amber-300/80 animate-pulse transition-all"
            style={{
              top: safeRect.top - 8,
              left: safeRect.left - 8,
              width: safeRect.width + 16,
              height: safeRect.height + 16,
            }}
          />
        </>
      )}

      <div
        ref={bubbleRef}
        className="pointer-events-auto absolute w-[320px] rounded-xl border border-border bg-card p-3 shadow-2xl"
        style={
          hasTarget
            ? { top: safeBubble.top, left: safeBubble.left }
            : { top: 16, left: "50%", transform: "translateX(-50%)" }
        }
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-400">
          Step {displayedStep} of {displayedTotal}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">{currentStep.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {currentStep.description}
        </p>
        {!canProceed && (currentStep.blockedMessage || visibilityMessage) && (
          <p className="mt-2 text-xs text-amber-500">
            {visibilityMessage ?? currentStep.blockedMessage}
          </p>
        )}
        {!hasTarget && (
          <p className="mt-2 text-xs text-amber-500">
            {currentStep.strictTarget
              ? "Open the required UI to continue this step."
              : "Waiting for the highlighted area to load. You can still click Next when ready."}
          </p>
        )}
        {showSkipConfirm ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-amber-500">
              Are you sure you want to skip the onboarding walkthrough?
            </p>
            <p className="text-xs text-muted-foreground">
              You can always run it again from Settings -&gt; Onboarding Walkthrough.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                className="rounded-md border border-input px-2.5 py-1 text-xs text-foreground hover:border-primary/40"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={closeAndMarkDone}
                className="rounded-md border border-red-500/40 bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                Yes, Skip
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowSkipConfirm(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => {
                autoAdvancedStepRef.current = {};
                suppressAutoAdvanceForIndexRef.current = Math.max(currentIndex - 1, 0);
                setCurrentIndex((prev) => Math.max(0, prev - 1));
              }}
              className={cn(
                "rounded-md border border-input px-2.5 py-1 text-xs",
                currentIndex === 0
                  ? "cursor-not-allowed text-muted-foreground/50"
                    : "text-foreground hover:border-primary/40",
                )}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => {
                  if (!canProceed) return;
                  if (isLast) {
                    if (markDoneOnFinish) {
                      closeAndMarkDone();
                    } else {
                      setIsOpen(false);
                    }
                    onFinish?.();
                    return;
                  }
                  setCurrentIndex((prev) => prev + 1);
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  canProceed
                    ? "border-cyan-500/40 bg-cyan-600 text-white hover:bg-cyan-500"
                    : "cursor-not-allowed border-input bg-muted text-muted-foreground",
                )}
              >
                {isLast ? (onFinish ? "Next" : "Finish") : "Next"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
