"use client";

/**
 * CharacterPopup — Main popup shell with Floating UI positioning.
 *
 * Composes all sub-components:
 *   - PopupHeader (word, pinyin, jyutping, definitions, source badge, TTS)
 *   - SaveVocabularyButton (bookmark toggle with optimistic UI)
 *   - ToneComparison (per-character Mandarin/Cantonese tone display)
 *   - RadicalBreakdown (radical, decomposition, etymology)
 *   - StrokeAnimation (HanziWriter with play/pause/replay)
 *   - ExampleWords (example words containing the character)
 *
 * Positioned via Floating UI with flip/shift middleware, appearing above
 * the hovered word. Supports desktop hover and mobile tap interactions.
 */

import { useEffect, useRef } from "react";
import {
  useFloating,
  offset,
  flip,
  shift,
} from "@floating-ui/react-dom";
import { useTTS } from "@/hooks/useTTS";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  VirtualElement,
  LookupData,
  CharacterDetailData,
  CharacterFallback,
} from "@/hooks/useCharacterPopup";
import { PopupHeader } from "./popup/PopupHeader";
import { SaveVocabularyButton } from "./popup/SaveVocabularyButton";
import { VocabularyListManager } from "./popup/VocabularyListManager";
import { AddToSRSButton } from "./popup/AddToSRSButton";
import { ToneComparison } from "./popup/ToneComparison";
import { RadicalBreakdown } from "./popup/RadicalBreakdown";
import { StrokeAnimation } from "./popup/StrokeAnimation";
import { ExampleWords } from "./popup/ExampleWords";

// --- Props ---

export interface CharacterPopupProps {
  isVisible: boolean;
  virtualEl: VirtualElement | null;
  activeWord: string | null;
  lookupData: LookupData | null;
  characterData: CharacterDetailData | null;
  characterFallbacks?: CharacterFallback[] | null;
  isLoading: boolean;
  error: string | null;
  isSaved: boolean;
  savedItemId: string | null;
  onToggleSave: () => void;
  onEnsureSaved: () => Promise<string | null>;
  onHide: () => void;
  onCancelHide: () => void;
  toneColorsEnabled?: boolean;
}

// --- Component ---

export function CharacterPopup({
  isVisible,
  virtualEl,
  activeWord,
  lookupData,
  characterData,
  characterFallbacks,
  isLoading,
  error,
  isSaved,
  savedItemId,
  onToggleSave,
  onEnsureSaved,
  onHide,
  onCancelHide,
  toneColorsEnabled = false,
}: CharacterPopupProps) {
  const { speak, isLoading: isTTSLoading, isPlaying: isTTSPlaying } = useTTS();
  const popupRef = useRef<HTMLDivElement>(null);

  // Floating UI positioning
  const { refs, floatingStyles } = useFloating({
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  // Sync virtual element as the Floating UI reference
  useEffect(() => {
    if (virtualEl) {
      refs.setReference(virtualEl as unknown as HTMLElement);
    }
  }, [virtualEl, refs]);

  // Touch device: tap outside popup to close
  useEffect(() => {
    if (!isVisible) return;

    const isTouchDevice =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches;

    if (!isTouchDevice) return;

    function handleDocumentClick(e: MouseEvent) {
      const popup = popupRef.current;
      if (!popup) return;

      // If click is outside the popup, hide it
      if (!popup.contains(e.target as Node)) {
        onHide();
      }
    }

    // Delay listener attachment to avoid the triggering tap from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener("click", handleDocumentClick, true);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isVisible, onHide]);

  // Don't render when not visible or no word
  if (!isVisible || !activeWord) {
    return null;
  }

  // Determine what data is available
  const hasLookupData = lookupData && lookupData.entries.length > 0;
  const entry = hasLookupData ? lookupData.entries[0] : null;
  const charDetail = characterData?.character ?? null;
  const examples = characterData?.examples ?? [];
  const isSingleChar = [...activeWord].length === 1;

  return (
    <div
      ref={(node) => {
        refs.setFloating(node);
        // Also store in our popupRef for touch-outside detection
        (popupRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={floatingStyles}
      onMouseEnter={onCancelHide}
      onMouseLeave={onHide}
      className="z-50"
    >
      <div className="w-[340px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
        {/* Loading state — content-shaped skeleton */}
        {isLoading && !lookupData && (
          <div className="px-3 py-3 space-y-2.5">
            {/* Character + pinyin area */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-14 bg-muted rounded" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24 bg-muted rounded" />
                <Skeleton className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
            {/* Definition lines */}
            <Skeleton className="h-3 w-full bg-muted rounded" />
            <Skeleton className="h-3 w-3/4 bg-muted rounded" />
            {/* Tone comparison placeholder */}
            <div className="pt-1 flex gap-4">
              <Skeleton className="h-3 w-16 bg-muted rounded" />
              <Skeleton className="h-3 w-16 bg-muted rounded" />
            </div>
          </div>
        )}

        {/* Error state — shows word and recovery guidance */}
        {error && !lookupData && (
          <div className="px-3 py-4">
            <span className="text-3xl font-bold text-foreground">
              {activeWord}
            </span>
            <p className="mt-2 text-sm text-red-400/80">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try hovering over the word again, or check your connection.
            </p>
          </div>
        )}

        {/* Empty state — PLECO-style per-character fallback or missing entry message */}
        {!isLoading && !error && !hasLookupData && (
          <div className="px-3 py-3">
            <span className="text-3xl font-bold text-foreground">
              {activeWord}
            </span>
            {characterFallbacks && characterFallbacks.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  No compound word entry — showing individual characters:
                </p>
                <div className="mt-2 space-y-1.5">
                  {characterFallbacks.map((fb) => {
                    if (fb.entries.length === 0) return null;
                    const entry = fb.entries[0];
                    return (
                      <div
                        key={fb.character}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <span className="text-lg font-bold text-foreground shrink-0">
                          {fb.character}
                        </span>
                        <div className="min-w-0">
                          <span className="text-blue-400 text-xs mr-1.5">
                            {entry.pinyinDisplay}
                          </span>
                          {entry.jyutping && (
                            <span className="text-orange-400 text-xs mr-1.5">
                              {entry.jyutping}
                            </span>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {entry.definitions.filter((d: string) => !d.startsWith("CL:")).slice(0, 3).join("; ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  No dictionary entry found
                </p>
                <p className="mt-2 text-xs text-muted-foreground/70">
                  This word may not be in the CC-CEDICT dictionary.
                  Try looking it up in an online dictionary for more information.
                </p>
              </>
            )}
          </div>
        )}

        {/* Main content — only render sections when data is available */}
        {hasLookupData && (
          <>
            {/* Header: word, pinyin, jyutping, definitions, source, TTS */}
            <div className="flex items-start justify-between">
              <PopupHeader
                word={activeWord}
                entries={lookupData.entries}
                onSpeakMandarin={() =>
                  speak(activeWord, { language: "zh-CN" })
                }
                onSpeakCantonese={() =>
                  speak(activeWord, { language: "zh-HK" })
                }
                isPlayingTTS={isTTSPlaying}
                isLoadingTTS={isTTSLoading}
                toneColorsEnabled={toneColorsEnabled}
              />
              <div className="pt-2 pr-2 flex items-center gap-1">
                {entry && (
                  <AddToSRSButton
                    traditional={entry.traditional || activeWord}
                    simplified={entry.simplified || activeWord}
                    pinyin={entry.pinyinDisplay}
                    jyutping={entry.jyutping}
                    meaning={entry.definitions.filter((d: string) => !d.startsWith("CL:")).slice(0, 3).join("; ") || "No definition"}
                  />
                )}
                <VocabularyListManager 
                  savedItemId={savedItemId}
                  onEnsureSaved={onEnsureSaved}
                />
                <SaveVocabularyButton
                  isSaved={isSaved}
                  isLoading={false}
                  onToggle={onToggleSave}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="mx-3 border-t border-border/50" />

            {/* Tone Comparison */}
            <ToneComparison
              word={activeWord}
              pinyinDisplay={entry?.pinyinDisplay ?? null}
              jyutping={entry?.jyutping ?? null}
            />

            {/* Radical Breakdown — only if character data exists */}
            {charDetail && (
              <>
                <div className="mx-3 border-t border-border/50" />
                <RadicalBreakdown
                  radical={charDetail.radical}
                  radicalMeaning={charDetail.radicalMeaning}
                  decomposition={charDetail.decomposition}
                  etymologyType={charDetail.etymologyType}
                  etymologyHint={charDetail.etymologyHint}
                  etymologyPhonetic={charDetail.etymologyPhonetic}
                  etymologySemantic={charDetail.etymologySemantic}
                  strokeCount={charDetail.strokeCount}
                />
              </>
            )}

            {/* Stroke Animation — only for single characters with data */}
            {isSingleChar && charDetail && (
              <>
                <div className="mx-3 border-t border-border/50" />
                <StrokeAnimation character={activeWord} />
              </>
            )}

            {/* Example Words — only if examples exist */}
            {examples.length > 0 && (
              <>
                <div className="mx-3 border-t border-border/50" />
                <ExampleWords examples={examples} />
              </>
            )}

            {/* Bottom padding for scrollable content */}
            <div className="h-1" />
          </>
        )}
      </div>
    </div>
  );
}
