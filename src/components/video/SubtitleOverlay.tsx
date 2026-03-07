"use client";

/**
 * SubtitleOverlay Component
 *
 * Renders Chinese subtitles with Ruby annotations for Pinyin (Mandarin)
 * and Jyutping (Cantonese) romanization. Supports character-by-character
 * annotation pairing for proper alignment.
 */

import type { SubtitleCue } from "@/types/video";

/**
 * Props for the SubtitleOverlay component.
 */
export interface SubtitleOverlayProps {
  /** Current video playback time in seconds */
  currentTime: number;
  /** Array of subtitle cues with timestamps */
  cues: SubtitleCue[];
  /** Whether to show Pinyin annotations */
  showPinyin: boolean;
  /** Whether to show Jyutping annotations */
  showJyutping: boolean;
}

/**
 * Parse Chinese text and annotations into character arrays.
 * Handles cases where annotations may be space-separated syllables.
 */
function parseAnnotations(
  chinese: string,
  pinyin?: string,
  jyutping?: string
): Array<{ char: string; pinyin?: string; jyutping?: string }> {
  const chars = [...chinese]; // Spread to handle multi-byte characters
  const pinyinArr = pinyin?.split(" ") ?? [];
  const jyutpingArr = jyutping?.split(" ") ?? [];

  return chars.map((char, i) => ({
    char,
    pinyin: pinyinArr[i],
    jyutping: jyutpingArr[i],
  }));
}

/**
 * Find the active subtitle cue for the current time.
 */
function findActiveCue(
  cues: SubtitleCue[],
  currentTime: number
): SubtitleCue | null {
  return (
    cues.find(
      (cue) => currentTime >= cue.startTime && currentTime < cue.endTime
    ) ?? null
  );
}

/**
 * Subtitle overlay with Ruby annotations for Chinese characters.
 *
 * Uses HTML `<ruby>` and `<rt>` elements for proper annotation rendering.
 * Pinyin is displayed in yellow, Jyutping in cyan.
 *
 * @example
 * ```tsx
 * <SubtitleOverlay
 *   currentTime={12.5}
 *   cues={subtitleCues}
 *   showPinyin={true}
 *   showJyutping={false}
 * />
 * ```
 */
export function SubtitleOverlay({
  currentTime,
  cues,
  showPinyin,
  showJyutping,
}: SubtitleOverlayProps) {
  const activeCue = findActiveCue(cues, currentTime);

  if (!activeCue) {
    return null;
  }

  const annotations = parseAnnotations(
    activeCue.chinese,
    activeCue.pinyin,
    activeCue.jyutping
  );

  // Determine if we should show any annotations
  const hasAnnotations = showPinyin || showJyutping;

  return (
    <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-10">
      <div className="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg max-w-[90%]">
        <p
          className="text-2xl text-white text-center tracking-wide"
          style={{ lineHeight: hasAnnotations ? "2.5" : "1.5" }}
        >
          {annotations.map((item, index) => (
            <ruby key={index} className="mx-0.5">
              {item.char}
              {hasAnnotations && (
                <rp>(</rp>
              )}
              {/* Pinyin annotation (yellow) */}
              {showPinyin && item.pinyin && (
                <rt className="text-sm text-yellow-400 font-normal">
                  {item.pinyin}
                </rt>
              )}
              {/* Jyutping annotation (cyan) - shows below pinyin if both enabled */}
              {showJyutping && item.jyutping && (
                <rt className="text-sm text-cyan-400 font-normal">
                  {showPinyin && item.pinyin ? ` / ${item.jyutping}` : item.jyutping}
                </rt>
              )}
              {hasAnnotations && (
                <rp>)</rp>
              )}
            </ruby>
          ))}
        </p>
      </div>
    </div>
  );
}
