"use client";

/**
 * TranscriptToolbar -- Compact toolbar for transcript controls.
 *
 * Provides:
 *   - Annotation mode toggle (plain / pinyin / jyutping)
 *   - Script mode toggle (original / simplified / traditional)
 *   - Vocabulary stats badge (known / total)
 *   - Speed selector + subtitle toggles
 *   - Loop mode toggle + auto-pause toggle + resume button
 */

import { cn } from "@/lib/utils";
import {
  Languages,
  BookOpen,
  Loader2,
  Gauge,
  Subtitles,
  Repeat,
  PauseCircle,
  PlayCircle,
  X,
} from "lucide-react";
import type { AnnotationMode } from "@/components/reader/WordSpan";
import type { ScriptMode } from "@/lib/chinese-convert";

/** The rates we display in the UI (subset of what YouTube supports) */
const DISPLAY_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface TranscriptToolbarProps {
  annotationMode: AnnotationMode;
  scriptMode: ScriptMode;
  onAnnotationModeChange: (mode: AnnotationMode) => void;
  onScriptModeChange: (mode: ScriptMode) => void;
  vocabStats: { known: number; unknown: number; total: number } | null;
  isConverting?: boolean;
  // Speed control
  playbackRate?: number;
  availableRates?: number[];
  onPlaybackRateChange?: (rate: number) => void;
  // Subtitle toggles
  showChineseSubs?: boolean;
  showEnglishSubs?: boolean;
  onToggleChineseSubs?: () => void;
  onToggleEnglishSubs?: () => void;
  hasEnglishCaptions?: boolean;
  // Loop mode
  loopModeActive?: boolean;
  onToggleLoopMode?: () => void;
  loopRange?: { startIndex: number; endIndex: number } | null;
  onClearLoop?: () => void;
  // Auto-pause
  autoPauseEnabled?: boolean;
  onToggleAutoPause?: () => void;
  isAutoPaused?: boolean;
  onResumeFromAutoPause?: () => void;
}

const annotationModes: { value: AnnotationMode; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "pinyin", label: "Pinyin" },
  { value: "jyutping", label: "JP" },
];

const scriptModes: { value: ScriptMode; label: string }[] = [
  { value: "original", label: "Orig" },
  { value: "simplified", label: "Simp" },
  { value: "traditional", label: "Trad" },
];

export function TranscriptToolbar({
  annotationMode,
  scriptMode,
  onAnnotationModeChange,
  onScriptModeChange,
  vocabStats,
  isConverting = false,
  playbackRate = 1,
  availableRates = [],
  onPlaybackRateChange,
  showChineseSubs = false,
  showEnglishSubs = false,
  onToggleChineseSubs,
  onToggleEnglishSubs,
  hasEnglishCaptions = false,
  loopModeActive = false,
  onToggleLoopMode,
  loopRange,
  onClearLoop,
  autoPauseEnabled = false,
  onToggleAutoPause,
  isAutoPaused = false,
  onResumeFromAutoPause,
}: TranscriptToolbarProps) {
  // Filter available rates to only show the standard display rates
  const displayRates = DISPLAY_RATES.filter(
    (rate) => availableRates.length === 0 || availableRates.includes(rate)
  );

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border bg-card/80">
      {/* Row 1: Title + Annotation/Script/Vocab controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Title */}
        <h2 className="mr-1 text-sm font-semibold text-foreground/90 shrink-0">
          Transcript
        </h2>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Annotation mode */}
          <div className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1">
            <Languages className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex rounded-md overflow-hidden border border-border">
              {annotationModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => onAnnotationModeChange(mode.value)}
                  className={cn(
                    "px-2 py-0.5 text-xs transition-colors",
                    annotationMode === mode.value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script mode */}
          <div className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1">
            {isConverting ? (
              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            ) : (
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <div className="flex rounded-md overflow-hidden border border-border">
              {scriptModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => onScriptModeChange(mode.value)}
                  className={cn(
                    "px-2 py-0.5 text-xs transition-colors",
                    scriptMode === mode.value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vocab stats */}
          {vocabStats && vocabStats.total > 0 && (
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              <span className="text-emerald-400 font-medium">
                {vocabStats.known}
              </span>
              <span>/</span>
              <span>{vocabStats.total}</span>
              <span>known</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Speed selector + Subtitle toggles */}
      {onPlaybackRateChange && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Speed selector */}
          <div className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex rounded-md overflow-hidden border border-border">
              {displayRates.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onPlaybackRateChange(rate)}
                  className={cn(
                    "px-1.5 py-0.5 text-xs transition-colors",
                    playbackRate === rate
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle toggles */}
          <div className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1">
            <Subtitles className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                type="button"
                onClick={onToggleChineseSubs}
                className={cn(
                  "px-2 py-0.5 text-xs transition-colors",
                  showChineseSubs
                    ? "bg-cyan-700/50 text-cyan-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                CN
              </button>
              <button
                type="button"
                onClick={onToggleEnglishSubs}
                className={cn(
                  "px-2 py-0.5 text-xs transition-colors",
                  showEnglishSubs
                    ? "bg-cyan-700/50 text-cyan-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row 3: Loop mode + Auto-pause + Resume */}
      {(onToggleLoopMode || onToggleAutoPause) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Loop toggle */}
            {onToggleLoopMode && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleLoopMode}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors border",
                    loopModeActive || loopRange
                      ? "bg-amber-700/50 text-amber-300 border-amber-600/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted border-border"
                  )}
                >
                  <Repeat className="w-3 h-3" />
                  {loopModeActive ? "Selecting..." : "Loop"}
                </button>
                {loopRange && (
                  <>
                    <span className="text-xs text-amber-400/70">
                      {loopRange.startIndex + 1}-{loopRange.endIndex + 1}
                    </span>
                    {onClearLoop && (
                      <button
                        type="button"
                        onClick={onClearLoop}
                        className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Clear loop"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Auto-pause toggle */}
            {onToggleAutoPause && (
              <button
                type="button"
                onClick={onToggleAutoPause}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors border",
                  autoPauseEnabled
                    ? "bg-violet-700/50 text-violet-300 border-violet-600/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-border"
                )}
              >
                <PauseCircle className="w-3 h-3" />
                Auto-pause
              </button>
            )}
          </div>

          {/* Resume from auto-pause button */}
          {isAutoPaused && onResumeFromAutoPause && (
            <button
              type="button"
              onClick={onResumeFromAutoPause}
              className="flex items-center gap-1 bg-cyan-600 text-white px-3 py-1 rounded-md animate-pulse text-xs font-medium"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Click to continue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
