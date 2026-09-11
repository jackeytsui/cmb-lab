"use client";

/**
 * SubtitleOverlay Component
 *
 * Renders Chinese subtitles with independently selectable Pinyin (Mandarin)
 * and Jyutping (Cantonese) rows aligned character by character.
 */

import type { SubtitleCue } from "@/types/video";
import { AlignedLanguageText } from "@/components/language/AlignedLanguageText";

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
 * Subtitle overlay with selectable aligned annotation rows.
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

  return (
    <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-10">
      <div className="pointer-events-auto max-w-[90%] rounded-lg bg-black/70 px-4 py-2 backdrop-blur-sm">
        <AlignedLanguageText
          chinese={activeCue.chinese}
          pinyin={activeCue.pinyin}
          jyutping={activeCue.jyutping}
          showPinyin={showPinyin}
          showJyutping={showJyutping}
          fontSize={24}
          annotationSize={14}
          contentClassName="justify-center"
          chineseClassName="px-0.5 font-normal text-white"
          pinyinClassName="text-yellow-400"
          jyutpingClassName="text-cyan-400"
        />
      </div>
    </div>
  );
}
