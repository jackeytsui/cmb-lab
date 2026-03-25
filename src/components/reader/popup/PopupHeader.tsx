"use client";

/**
 * PopupHeader — Main header area of the character popup.
 *
 * Displays the word prominently with pinyin, jyutping, definitions,
 * a source badge (Mandarin/Cantonese/Shared), and TTS play buttons
 * for both languages.
 */

import { Volume2, Loader2 } from "lucide-react";
import type { DictionaryEntry } from "@/hooks/useCharacterPopup";

export interface PopupHeaderProps {
  word: string;
  entries: DictionaryEntry[];
  onSpeakMandarin: () => void;
  onSpeakCantonese: () => void;
  isPlayingTTS: boolean;
  isLoadingTTS: boolean;
}

/** Source badge styling by dictionary source */
const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  cedict: {
    label: "Mandarin",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  canto: {
    label: "Cantonese",
    className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  both: {
    label: "Shared",
    className: "bg-muted/40 text-muted-foreground border-border/40",
  },
};

export function PopupHeader({
  word,
  entries,
  onSpeakMandarin,
  onSpeakCantonese,
  isPlayingTTS,
  isLoadingTTS,
}: PopupHeaderProps) {
  const entry = entries[0];

  if (!entry) {
    return (
      <div className="px-3 py-2">
        <span className="text-3xl font-bold text-foreground">{word}</span>
        <p className="mt-1 text-sm text-muted-foreground">No dictionary data found</p>
      </div>
    );
  }

  const pinyinDisplay = entry.pinyinDisplay || null;
  const jyutping = entry.jyutping || null;
  const definitions = entry.definitions.filter((d: string) => !d.startsWith("CL:")).slice(0, 3);
  const sourceBadge = SOURCE_BADGE_STYLES[entry.source] ?? SOURCE_BADGE_STYLES.both;

  return (
    <div className="px-3 py-2">
      {/* Word + source badge */}
      <div className="flex items-center gap-2">
        <span className="text-3xl font-bold text-foreground">{word}</span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${sourceBadge.className}`}
        >
          {sourceBadge.label}
        </span>
      </div>

      {/* Pinyin + Jyutping */}
      <div className="mt-1 flex items-center gap-3 text-sm">
        {pinyinDisplay && (
          <span className="text-amber-400">{pinyinDisplay}</span>
        )}
        <span className="text-cyan-400">{jyutping ?? "\u2014"}</span>
      </div>

      {/* Definitions */}
      <p className="mt-1 text-sm leading-snug text-muted-foreground">
        {definitions.join(", ")}
        {entry.definitions.length > 3 && (
          <span className="text-muted-foreground">
            {" "}
            +{entry.definitions.length - 3} more
          </span>
        )}
      </p>

      {/* TTS buttons */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSpeakMandarin}
          disabled={isLoadingTTS}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          title="Listen in Mandarin"
        >
          {isLoadingTTS ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Volume2
              className={`h-3.5 w-3.5 ${isPlayingTTS ? "animate-pulse" : ""}`}
            />
          )}
          Mandarin
        </button>

        <button
          type="button"
          onClick={onSpeakCantonese}
          disabled={isLoadingTTS}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/10 disabled:opacity-50"
          title="Listen in Cantonese"
        >
          {isLoadingTTS ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Volume2
              className={`h-3.5 w-3.5 ${isPlayingTTS ? "animate-pulse" : ""}`}
            />
          )}
          Cantonese
        </button>
      </div>
    </div>
  );
}
