"use client";

import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TranscriptLine } from "@/components/video/TranscriptLine";
import type { AnnotationMode } from "@/components/reader/WordSpan";

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  sequence: number;
}

interface TranscriptPanelProps {
  captions: Caption[];
  activeCaptionIndex?: number;
  onLineClick: (index: number) => void;
  annotationMode?: AnnotationMode;
  onWordHover?: (word: string, index: number, element: HTMLElement) => void;
  onWordClick?: (word: string, index: number, element: HTMLElement) => void;
  isPopupVisible?: boolean;
  /** Converted caption texts (when T/S conversion is active). Overrides caption.text per line. */
  displayTexts?: string[];
  /** Set of known word forms for vocabulary highlighting. */
  savedVocabSet?: Set<string>;
  /** Pre-segmented words from jieba (server-side), one array per caption line. */
  jiebaSegments?: Array<Array<{ text: string; isWordLike: boolean }>>;
  /** Whether loop selection mode is active (user is picking start/end lines) */
  loopModeActive?: boolean;
  /** Current loop range (start/end caption indices) */
  loopRange?: { startIndex: number; endIndex: number } | null;
  /** Called when user clicks a line during loop selection mode */
  onLoopRangeSelect?: (index: number) => void;
  /** Called when TTS play button is clicked on a line */
  onTtsPlay?: (index: number) => void;
  /** Index of the line currently being spoken by TTS */
  ttsLineIndex?: number;
  /** Whether TTS is currently loading audio */
  isTtsLoading?: boolean;
  /** Whether TTS is currently playing audio */
  isTtsPlaying?: boolean;
  /** English translations per line (when translation mode is active) */
  englishTexts?: string[];
  /** Optional onboarding target id for the first transcript line */
  firstLineTourId?: string;
  /** Optional onboarding target id for the first line TTS button */
  firstLineTtsTourId?: string;
}

function findWordElement(target: EventTarget): HTMLElement | null {
  const el = target as HTMLElement;
  if (!el.closest) return null;
  return el.closest("[data-word]") as HTMLElement | null;
}

/**
 * TranscriptPanel -- Scrollable caption list with auto-scroll and user scroll detection.
 *
 * Auto-scroll: When activeCaptionIndex changes, scrolls the active line into view (centered).
 * User scroll: If the user manually scrolls, auto-scroll pauses for 4 seconds.
 * Click navigation: Clicking a line resets user scroll state so auto-scroll resumes immediately.
 * Loop selection: When loopModeActive, clicks route to onLoopRangeSelect instead of onLineClick.
 */
export function TranscriptPanel({
  captions,
  activeCaptionIndex = -1,
  onLineClick,
  annotationMode = "plain",
  onWordHover,
  onWordClick,
  isPopupVisible = false,
  displayTexts,
  savedVocabSet,
  jiebaSegments,
  loopModeActive = false,
  loopRange,
  onLoopRangeSelect,
  onTtsPlay,
  ttsLineIndex = -1,
  isTtsLoading = false,
  isTtsPlaying = false,
  englishTexts,
  firstLineTourId,
  firstLineTtsTourId,
}: TranscriptPanelProps) {
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect manual user scroll -- pause auto-scroll for 4 seconds
  const handleContainerScroll = useCallback(() => {
    isUserScrollingRef.current = true;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 4000);
  }, []);

  // Event delegation: word hover
  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (!onWordHover) return;
      const wordEl = findWordElement(e.target);
      if (!wordEl) return;
      const word = wordEl.getAttribute("data-word");
      const index = Number(wordEl.getAttribute("data-index") ?? 0);
      if (word) onWordHover(word, index, wordEl);
    },
    [onWordHover]
  );

  // Event delegation: word click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onWordClick) return;
      const wordEl = findWordElement(e.target);
      if (!wordEl) return;
      const word = wordEl.getAttribute("data-word");
      const index = Number(wordEl.getAttribute("data-index") ?? 0);
      if (word) {
        e.stopPropagation();
        onWordClick(word, index, wordEl);
      }
    },
    [onWordClick]
  );

  // Auto-scroll to active caption (centered) when it changes
  // Suppressed when popup is visible or user is manually scrolling
  useEffect(() => {
    if (
      activeCaptionIndex < 0 ||
      !activeLineRef.current ||
      isUserScrollingRef.current ||
      isPopupVisible
    ) {
      return;
    }

    activeLineRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeCaptionIndex, isPopupVisible]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Click handler: reset user scroll state (intentional navigation) then seek or loop-select
  const handleLineClick = useCallback(
    (index: number) => {
      isUserScrollingRef.current = false;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      // In loop selection mode, route to loop handler
      if (loopModeActive && onLoopRangeSelect) {
        onLoopRangeSelect(index);
        return;
      }

      onLineClick(index);
    },
    [onLineClick, loopModeActive, onLoopRangeSelect]
  );

  return (
    <div className="flex flex-col h-full">
      <div
        onScroll={handleContainerScroll}
        onMouseOver={handleMouseOver}
        onClick={handleClick}
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-1",
          loopModeActive && "cursor-crosshair border-l-2 border-amber-500/30"
        )}
      >
        {captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <p>No transcript available</p>
            <p className="text-xs mt-1">
              Extract or upload captions to see the transcript
            </p>
          </div>
        ) : (
          captions.map((caption, index) => {
            const isInLoopRange = loopRange
              ? index >= loopRange.startIndex && index <= loopRange.endIndex
              : false;
            const isLoopStart = loopRange
              ? index === loopRange.startIndex
              : false;
            const isLoopEnd = loopRange
              ? index === loopRange.endIndex
              : false;

            return (
              <TranscriptLine
                key={caption.sequence}
                ref={index === activeCaptionIndex ? activeLineRef : undefined}
                isActive={index === activeCaptionIndex}
                text={displayTexts?.[index] ?? caption.text}
                startMs={caption.startMs}
                onClick={() => handleLineClick(index)}
                annotationMode={annotationMode}
                savedVocabSet={savedVocabSet}
                preSegments={jiebaSegments?.[index]}
                isInLoopRange={isInLoopRange}
                isLoopStart={isLoopStart}
                isLoopEnd={isLoopEnd}
                onTtsPlay={onTtsPlay ? () => onTtsPlay(index) : undefined}
                isTtsLoading={ttsLineIndex === index && isTtsLoading}
                isTtsPlaying={ttsLineIndex === index && isTtsPlaying}
                isTtsDisabled={
                  (isTtsLoading || isTtsPlaying) && ttsLineIndex !== index
                }
                englishText={englishTexts?.[index]}
                lineTourId={index === 0 ? firstLineTourId : undefined}
                ttsButtonTourId={index === 0 ? firstLineTtsTourId : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
