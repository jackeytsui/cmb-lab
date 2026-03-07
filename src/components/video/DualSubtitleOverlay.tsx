"use client";

/**
 * DualSubtitleOverlay -- Renders Chinese and English subtitles
 * as an overlay on the video player.
 *
 * Each language is independently togglable. Uses binary search
 * (findActiveCaptionIndex) to find the active caption at the
 * current playback time for each language independently, since
 * timestamps may differ between Chinese and English tracks.
 */

import { findActiveCaptionIndex } from "@/hooks/useVideoSync";

interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
  sequence: number;
}

interface DualSubtitleOverlayProps {
  currentTimeMs: number;
  chineseCaptions: CaptionLine[];
  englishCaptions: CaptionLine[] | null;
  showChinese: boolean;
  showEnglish: boolean;
}

export function DualSubtitleOverlay({
  currentTimeMs,
  chineseCaptions,
  englishCaptions,
  showChinese,
  showEnglish,
}: DualSubtitleOverlayProps) {
  const chineseIndex = showChinese
    ? findActiveCaptionIndex(chineseCaptions, currentTimeMs)
    : -1;
  const englishIndex =
    showEnglish && englishCaptions
      ? findActiveCaptionIndex(englishCaptions, currentTimeMs)
      : -1;

  if (chineseIndex < 0 && englishIndex < 0) return null;

  return (
    <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none z-10">
      {chineseIndex >= 0 && (
        <div className="bg-black/70 backdrop-blur-sm px-4 py-1.5 rounded-lg max-w-[90%]">
          <p className="text-xl text-white text-center">
            {chineseCaptions[chineseIndex].text}
          </p>
        </div>
      )}
      {englishIndex >= 0 && englishCaptions && (
        <div className="bg-black/60 backdrop-blur-sm px-4 py-1 rounded-lg max-w-[90%]">
          <p className="text-sm text-zinc-200 text-center">
            {englishCaptions[englishIndex].text}
          </p>
        </div>
      )}
    </div>
  );
}
