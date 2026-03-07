"use client";

/**
 * StrokeAnimation — HanziWriter wrapper with play/pause/replay controls.
 *
 * Creates a HanziWriter instance inside a ref container, manages its
 * lifecycle via useEffect (keyed on character), and provides animation
 * controls. Only renders for single characters.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import HanziWriter from "hanzi-writer";

export interface StrokeAnimationProps {
  character: string;
}

export function StrokeAnimation({ character }: StrokeAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Guard: only render for single characters
  const isSingleChar = [...character].length === 1;

  useEffect(() => {
    if (!isSingleChar || !containerRef.current) return;

    // Capture ref value for cleanup
    const container = containerRef.current;

    // Clear previous character SVG
    container.innerHTML = "";

    const writer = HanziWriter.create(container, character, {
      width: 120,
      height: 120,
      padding: 5,
      showOutline: true,
      strokeColor: "#e4e4e7", // zinc-200
      radicalColor: "#22d3ee", // cyan-400
      outlineColor: "#3f3f46", // zinc-700
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 300,
      renderer: "svg",
    });
    writerRef.current = writer;

    return () => {
      writerRef.current = null;
      // Clear container on cleanup
      container.innerHTML = "";
    };
  }, [character, isSingleChar]);

  const handlePlay = useCallback(() => {
    if (!writerRef.current) return;
    setIsAnimating(true);
    writerRef.current.animateCharacter({
      onComplete: () => {
        setIsAnimating(false);
      },
    });
  }, []);

  const handlePause = useCallback(() => {
    if (!writerRef.current) return;
    writerRef.current.pauseAnimation();
    setIsAnimating(false);
  }, []);

  const handleReplay = useCallback(() => {
    if (!writerRef.current) return;
    setIsAnimating(true);
    // hideCharacter then animate for a clean replay
    writerRef.current.hideCharacter();
    writerRef.current.animateCharacter({
      onComplete: () => {
        setIsAnimating(false);
      },
    });
  }, []);

  if (!isSingleChar) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2 px-3 py-2">
      <h4 className="self-start text-xs font-medium uppercase text-muted-foreground">
        Stroke Order
      </h4>

      {/* HanziWriter renders into this container */}
      <div
        ref={containerRef}
        className="rounded-lg border border-border/50 bg-muted/50 p-1"
      />

      {/* Animation controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handlePlay}
          disabled={isAnimating}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/90 disabled:opacity-40"
          title="Play animation"
        >
          <Play className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handlePause}
          disabled={!isAnimating}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/90 disabled:opacity-40"
          title="Pause animation"
        >
          <Pause className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleReplay}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/90"
          title="Replay animation"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
