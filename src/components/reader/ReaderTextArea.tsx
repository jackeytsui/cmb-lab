"use client";

import { useRef, useCallback, useMemo } from "react";
import { FileText } from "lucide-react";
import type { WordSegment } from "@/lib/segmenter";
import { detectSentences } from "@/lib/sentences";
import { WordSpan } from "./WordSpan";
import { SentenceControls } from "./SentenceControls";
import { cn } from "@/lib/utils";

/** Standard glosses for grammatical particles — used as fallback for common words */
const PARTICLE_GLOSSES: Record<string, string> = {
  "的": "of/'s",
  "了": "(completed)",
  "个": "(mw)",
  "得": "(degree)",
  "地": "(-ly)",
  "着": "(-ing)",
  "吗": "(question)",
  "呢": "(question)",
  "吧": "(suggestion)",
  "啊": "(emphasis)",
  "把": "(object marker)",
  "被": "(passive)",
  "让": "let",
  "给": "give/to",
  "过": "(experienced)",
  "们": "(plural)",
  "所": "(that which)",
  "之": "of/'s",
  "其": "its/their",
  "与": "and/with",
  "也": "also",
  "就": "then/just",
  "都": "all/both",
  "还": "still/also",
  "又": "again/also",
  "才": "only then",
  "却": "but/yet",
  "并": "and/moreover",
  "则": "then/however",
  "即": "namely/i.e.",
};

export interface ReaderTextAreaProps {
  segments: WordSegment[];
  showPinyin: boolean;
  showJyutping: boolean;
  showEnglish: boolean;
  translationMode: "proper" | "direct";
  fontSize: number;
  onWordHover?: (word: string, index: number, element: HTMLElement) => void;
  onWordClick?: (word: string, index: number, element: HTMLElement) => void;
  language: "zh-CN" | "zh-HK";
  onSpeakSentence: (text: string, rate: "slow" | "medium" | "fast") => void;
  isSpeaking: boolean;
  speakingText: string | null;
  ttsError?: string | null;
  translationCache: Map<string, string>;
  onTranslationFetched: (text: string, translation: string) => void;
  batchTranslations?: Map<number, string>;
  /** Word → English definition map for direct translation mode */
  wordGlossMap?: Map<string, string>;
  isTranslating?: boolean;
  playingSentenceIndex?: number | null;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onSentencePlay?: (index: number) => void;
  firstSentencePlayTourId?: string;
  disableSentencePlayback?: boolean;
  className?: string;
  /** When true, color each character by its tone (Pleco scheme) */
  toneColorsEnabled?: boolean;
}

function findWordElement(target: EventTarget): HTMLElement | null {
  const el = target as HTMLElement;
  if (!el.closest) return null;
  return el.closest("[data-word]") as HTMLElement | null;
}

export function ReaderTextArea({
  segments,
  showPinyin,
  showJyutping,
  showEnglish,
  translationMode,
  fontSize,
  onWordHover,
  onWordClick,
  language,
  onSpeakSentence,
  isSpeaking,
  speakingText,
  ttsError,
  translationCache,
  onTranslationFetched,
  batchTranslations,
  wordGlossMap,
  isTranslating,
  playingSentenceIndex,
  containerRef,
  onSentencePlay,
  firstSentencePlayTourId,
  disableSentencePlayback = false,
  className: outerClassName,
  toneColorsEnabled = false,
}: ReaderTextAreaProps) {
  const lastHoveredIndexRef = useRef<number | null>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const ref = containerRef ?? fallbackRef;

  const sentences = useMemo(() => detectSentences(segments), [segments]);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (!onWordHover) return;
      const wordEl = findWordElement(e.target);
      if (!wordEl) return;
      const word = wordEl.getAttribute("data-word");
      const indexStr = wordEl.getAttribute("data-index");
      if (!word || indexStr === null) return;
      const index = Number(indexStr);
      if (index === lastHoveredIndexRef.current) return;
      lastHoveredIndexRef.current = index;
      onWordHover(word, index, wordEl);
    },
    [onWordHover],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onWordClick) return;
      const wordEl = findWordElement(e.target);
      if (!wordEl) return;
      const word = wordEl.getAttribute("data-word");
      const indexStr = wordEl.getAttribute("data-index");
      if (!word || indexStr === null) return;
      onWordClick(word, Number(indexStr), wordEl);
    },
    [onWordClick],
  );

  const handleMouseLeave = useCallback(() => {
    lastHoveredIndexRef.current = null;
  }, []);

  if (segments.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center text-muted-foreground">
        <FileText className="size-12 mb-3 opacity-50" />
        <p className="text-sm">Paste or import Chinese text to begin reading</p>
      </div>
    );
  }

  const sentenceGroups =
    sentences.length > 0
      ? sentences
      : [
          {
            startIndex: 0,
            endIndex: segments.length - 1,
            text: segments.map((s) => s.text).join(""),
          },
        ];

  const hasAnnotation = showPinyin || showJyutping;
  const isDirectWithEnglish = showEnglish && translationMode === "direct";

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement | null>}
      onMouseOver={handleMouseOver}
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
      className={cn("max-h-[calc(100vh-200px)] overflow-y-auto text-foreground", outerClassName)}
      style={{ fontSize: `${fontSize}px` }}
    >
      {sentenceGroups.map((sentence, sentenceIdx) => {
        const properTranslation = batchTranslations?.get(sentenceIdx);
        const hasWordGlosses = wordGlossMap && wordGlossMap.size > 0;
        const sentenceStillLoading = isTranslating && (
          !properTranslation || (isDirectWithEnglish && !hasWordGlosses)
        );
        const isHighlighted = playingSentenceIndex === sentenceIdx;

        return (
          <div
            key={sentenceIdx}
            data-sentence-idx={sentenceIdx}
            className={cn(
              "border-l-2 transition-all mb-2",
              isHighlighted
                ? "border-violet-400 bg-violet-500/10 pl-2"
                : "border-transparent hover:border-cyan-400/30 hover:pl-2",
            )}
          >
            {/* Word columns flow horizontally, aligned at bottom like a table */}
            <span
              className={cn(
                hasAnnotation || isDirectWithEnglish
                  ? "inline-flex items-end flex-wrap gap-y-1"
                  : "inline",
              )}
              style={hasAnnotation ? { lineHeight: "1.2" } : { lineHeight: "2" }}
            >
              {segments
                .slice(sentence.startIndex, sentence.endIndex + 1)
                .map((seg, i) => {
                  const globalIndex = sentence.startIndex + i;
                  // Direct mode: simple word lookup — particle overrides → GPT glosses → loading placeholder
                  let gloss: string | undefined;
                  if (isDirectWithEnglish && seg.isWordLike) {
                    gloss =
                      PARTICLE_GLOSSES[seg.text] ??
                      wordGlossMap?.get(seg.text) ??
                      (sentenceStillLoading ? "..." : undefined);
                  }
                  return (
                    <WordSpan
                      key={globalIndex}
                      text={seg.text}
                      index={globalIndex}
                      isWordLike={seg.isWordLike}
                      showPinyin={showPinyin}
                      showJyutping={showJyutping}
                      showEnglish={isDirectWithEnglish}
                      englishGloss={gloss}
                      fontSize={fontSize}
                      toneColorsEnabled={toneColorsEnabled}
                    />
                  );
                })}

              <SentenceControls
                sentenceText={sentence.text}
                language={language}
                onSpeak={onSpeakSentence}
                onPlayClick={() => onSentencePlay?.(sentenceIdx)}
                playButtonTourId={
                  sentenceIdx === 0 ? firstSentencePlayTourId : undefined
                }
                disableSentencePlayback={disableSentencePlayback}
                isPlaying={isSpeaking && speakingText === sentence.text}
                isLoading={false}
                ttsError={ttsError ?? null}
                translationCache={translationCache}
                onTranslationFetched={onTranslationFetched}
              />
            </span>

            {/* Proper mode: natural translation below sentence */}
            {showEnglish && translationMode === "proper" && properTranslation && (
              <div className="text-muted-foreground italic ml-1 mt-0.5 opacity-0 animate-[fadeIn_200ms_ease-out_forwards]" style={{ fontSize: `${Math.round(fontSize * 1.1)}px` }}>
                {properTranslation}
              </div>
            )}

            {/* Direct mode: show proper translation too as a subtle secondary line */}
            {showEnglish && translationMode === "direct" && properTranslation && (
              <div className="text-xs text-muted-foreground/70 italic ml-1 mt-0.5 opacity-0 animate-[fadeIn_200ms_ease-out_forwards]">
                ({properTranslation})
              </div>
            )}

            {/* Loading state */}
            {showEnglish && sentenceStillLoading && (
              <div className="text-xs text-muted-foreground italic ml-1 mt-0.5 animate-pulse">
                Translating...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
