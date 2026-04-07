"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { WordSpan } from "@/components/reader/WordSpan";
import { segmentText, type WordSegment } from "@/lib/segmenter";
import { detectSentences } from "@/lib/sentences";
import { convertScript } from "@/lib/chinese-convert";
import { useTTS } from "@/hooks/useTTS";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { Pencil, Trash2, Star, Download, ExternalLink, Link as LinkIcon, Play, Square, Loader2, Languages, Minus, Plus, Users, ChevronDown, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen, GripVertical, ArrowRightLeft, NotebookPen } from "lucide-react";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";
import { smartRomanise } from "@/lib/romanise";
import { useFeatureEngagement } from "@/hooks/useFeatureEngagement";
import { exportCoachingNotes } from "@/lib/coaching-export";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import {
  extractToneFromPinyin,
  extractToneFromJyutping,
  getToneColorStyle,
} from "@/lib/tone-colors";

async function fetchJiebaSegments(
  sentences: string[],
): Promise<WordSegment[][] | null> {
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < sentences.length; i += 200) {
      chunks.push(sentences.slice(i, i + 200));
    }

    const allSegments: WordSegment[][] = [];
    for (const chunk of chunks) {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      allSegments.push(
        ...data.segments.map(
          (segs: Array<{ text: string; isWordLike: boolean }>, idx: number) =>
            segs.map(
              (s: { text: string; isWordLike: boolean }, si: number) => ({
                text: s.text,
                index: si,
                isWordLike: s.isWordLike,
              }),
            ) || segmentText(chunk[idx]),
        ),
      );
    }
    return allSegments;
  } catch {
    return null;
  }
}

async function fetchProperTranslations(
  texts: string[],
  language: "zh-CN" | "zh-HK",
): Promise<string[] | null> {
  try {
    const cleanTexts = texts
      .map((t) => t.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim())
      .filter((t) => t.length > 0);
    if (cleanTexts.length === 0) return null;

    const res = await fetch("/api/reader/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: cleanTexts, mode: "proper", language }),
    });
    if (!res.ok) {
      console.error("Batch translate failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.translations ?? null;
  } catch (err) {
    console.error("Batch translate error:", err);
    return null;
  }
}

type ScriptMode = "simplified" | "traditional";
type PaneDraft = {
  draftText: string;
  committedText: string;
  scriptMode: ScriptMode;
};

type SessionNote = {
  id: string;
  pane: "mandarin" | "cantonese";
  order: number;
  text: string;
  createdAt: string | number;
  starred?: number;
  textOverride?: string;
  romanizationOverride?: string;
  translationOverride?: string;
  explanation?: string | null;
};

type CoachingSession = {
  id: string;
  title: string;
  type: "one_on_one" | "inner_circle";
  studentEmail?: string | null;
  recordingUrl?: string | null;
  fathomLink?: string | null;
  goals?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
  notes?: SessionNote[];
  mandarin: PaneDraft;
  cantonese: PaneDraft;
};

function useProcessedText({
  committedText,
  scriptMode,
  language,
}: {
  committedText: string;
  scriptMode: ScriptMode;
  language: "zh-CN" | "zh-HK";
}) {
  const [displayText, setDisplayText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [jiebaSegments, setJiebaSegments] = useState<WordSegment[] | null>(
    null,
  );
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [batchTranslations, setBatchTranslations] = useState<
    Map<number, string>
  >(new Map());
  const [isTranslating, setIsTranslating] = useState(false);
  const translatedKeyRef = useRef<string>("");
  const [translationCache, setTranslationCache] = useState<
    Map<string, string>
  >(new Map());

  const {
    speak,
    stop,
    isPlaying,
    isLoading: ttsLoading,
    error: ttsError,
  } = useTTS();
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    if (!committedText) {
      setDisplayText("");
      return;
    }

    if (scriptMode === "traditional") {
      setDisplayText(committedText);
      return;
    }

    let cancelled = false;
    setIsConverting(true);

    convertScript(committedText, "traditional", "simplified")
      .then((converted) => {
        if (!cancelled) setDisplayText(converted);
      })
      .catch((err) => {
        console.error("T/S conversion failed:", err);
        if (!cancelled) setDisplayText(committedText);
      })
      .finally(() => {
        if (!cancelled) setIsConverting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [committedText, scriptMode]);

  const fallbackSegments: WordSegment[] = useMemo(
    () => segmentText(displayText),
    [displayText],
  );

  useEffect(() => {
    if (!displayText) {
      setJiebaSegments(null);
      return;
    }

    setJiebaSegments(null);
    let cancelled = false;
    setIsSegmenting(true);

    const clientSegs = segmentText(displayText);
    const sentenceRanges = detectSentences(clientSegs);
    const sentenceTexts =
      sentenceRanges.length > 0
        ? sentenceRanges.map((s) => s.text)
        : [displayText];

    fetchJiebaSegments(sentenceTexts).then((result) => {
      if (cancelled) return;
      setIsSegmenting(false);
      if (result) {
        const flat: WordSegment[] = [];
        let offset = 0;
        for (const sentSegs of result) {
          for (const seg of sentSegs) {
            flat.push({ ...seg, index: offset });
            offset += seg.text.length;
          }
        }
        setJiebaSegments(flat);
      } else {
        setJiebaSegments(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayText]);

  const segments = jiebaSegments ?? fallbackSegments;
  const sentences = useMemo(() => detectSentences(segments), [segments]);
  const sentenceKey = useMemo(
    () => sentences.map((s) => s.text).join("|"),
    [sentences],
  );

  useEffect(() => {
    if (!displayText || sentences.length === 0) {
      setBatchTranslations(new Map());
      setTranslationCache(new Map());
      translatedKeyRef.current = "";
      return;
    }

    if (sentenceKey === translatedKeyRef.current) return;
    translatedKeyRef.current = sentenceKey;
    setIsTranslating(true);

    const sentenceTexts = sentences.map((s) => s.text);
    fetchProperTranslations(sentenceTexts, language)
      .then((translations) => {
        if (!translations) return;
        const map = new Map<number, string>();
        translations.forEach((t, idx) => {
          if (t) map.set(idx, t);
        });
        setBatchTranslations(map);

        setTranslationCache((prev) => {
          const next = new Map(prev);
          sentences.forEach((s, idx) => {
            const t = map.get(idx);
            if (t) next.set(s.text, t);
          });
          return next;
        });
      })
      .finally(() => {
        setIsTranslating(false);
      });
  }, [displayText, language, sentenceKey, sentences]);

  const handleSpeakSentence = useCallback(
    async (text: string, rate: "slow" | "medium" | "fast") => {
      setSpeakingText(text);
      await speak(text, { language, rate });
      setSpeakingText(null);
    },
    [language, speak],
  );

  const handleStopAll = useCallback(() => {
    stop();
    setSpeakingText(null);
  }, [stop]);

  return {
    sentences,
    displayText,
    isConverting,
    isSegmenting,
    segments,
    batchTranslations,
    isTranslating,
    translationCache,
    setTranslationCache,
    handleSpeakSentence,
    handleStopAll,
    isPlaying,
    ttsLoading,
    ttsError,
    speakingText,
  };
}

/** Pinyin tone marks lookup — vowel letter → array of tone 1-4 variants */
const TONE_MAP: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
  v: ["ǖ", "ǘ", "ǚ", "ǜ"], // v as alias for ü
  A: ["Ā", "Á", "Ǎ", "À"],
  E: ["Ē", "É", "Ě", "È"],
  I: ["Ī", "Í", "Ǐ", "Ì"],
  O: ["Ō", "Ó", "Ǒ", "Ò"],
  U: ["Ū", "Ú", "Ǔ", "Ù"],
};

const VOWELS = new Set("aeiouüvAEIOUÜ");

/**
 * Apply tone number to a pinyin syllable following standard placement rules:
 * 1. If there's an a or e, the tone goes on it
 * 2. If there's "ou", the tone goes on the o
 * 3. Otherwise the tone goes on the last vowel
 */
function applyToneToSyllable(syllable: string, tone: number): string {
  const chars = [...syllable];
  // Rule 1: a or e gets the tone
  for (let i = 0; i < chars.length; i++) {
    const lower = chars[i].toLowerCase();
    if (lower === "a" || lower === "e") {
      const toned = TONE_MAP[chars[i]];
      if (toned) chars[i] = toned[tone - 1];
      return chars.join("");
    }
  }
  // Rule 2: ou → tone on o
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].toLowerCase() === "o" && chars[i + 1].toLowerCase() === "u") {
      const toned = TONE_MAP[chars[i]];
      if (toned) chars[i] = toned[tone - 1];
      return chars.join("");
    }
  }
  // Rule 3: last vowel
  for (let i = chars.length - 1; i >= 0; i--) {
    if (VOWELS.has(chars[i])) {
      const toned = TONE_MAP[chars[i]];
      if (toned) chars[i] = toned[tone - 1];
      return chars.join("");
    }
  }
  return syllable;
}

/** Convert full pinyin syllables with trailing tone number: chang4→chàng, nü3→nǚ */
function applyInlineTones(text: string): string {
  return text.replace(/([a-züA-ZÜ]+)([1-4])/g, (match, syllable: string, tone: string) => {
    // Only convert if the syllable contains at least one vowel
    if (![...syllable].some((c) => VOWELS.has(c))) return match;
    return applyToneToSyllable(syllable, parseInt(tone, 10));
  });
}

function NoteCard({
  note,
  index,
  language,
  scriptMode,
  showPinyin,
  showJyutping,
  canEdit,
  canStar,
  fontSize,
  onToggleStar,
  onSave,
  onDelete,
  onCopyOver,
  onSaveExplanation,
  visualFontClass,
}: {
  note: SessionNote;
  index: number;
  language: "zh-CN" | "zh-HK";
  scriptMode: ScriptMode;
  showPinyin: boolean;
  showJyutping: boolean;
  canEdit: boolean;
  canStar: boolean;
  fontSize: number;
  onToggleStar: () => void;
  onSave: (updates: {
    textOverride?: string;
    romanizationOverride?: string;
    translationOverride?: string;
  }) => void;
  onDelete: () => void;
  onCopyOver?: () => void;
  onSaveExplanation?: (explanation: string) => void;
  visualFontClass?: string;
}) {
  const baseText = note.textOverride ?? note.text;
  // Derive language from the note's own pane field to ensure TTS always
  // speaks the correct language, even if the parent prop gets stale.
  const noteLanguage: "zh-CN" | "zh-HK" =
    note.pane === "cantonese" ? "zh-HK" : "zh-CN";
  const processed = useProcessedText({
    committedText: baseText,
    scriptMode,
    language: noteLanguage,
  });
  const { toneColorsEnabled } = useReaderPreferences();
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(baseText);
  const [draftRomanization, setDraftRomanization] = useState("");
  const [draftTranslation, setDraftTranslation] = useState("");
  const romanInputRef = useRef<HTMLInputElement>(null);
  const [ttsRate, setTtsRate] = useState<"slow" | "medium" | "fast">("medium");
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [isCopyingOver, setIsCopyingOver] = useState(false);
  const [showExplanation, setShowExplanation] = useState(!!note.explanation);
  const [explanationDraft, setExplanationDraft] = useState(note.explanation ?? "");
  const [savedExplanation, setSavedExplanation] = useState(note.explanation ?? "");
  const [isEditingExplanation, setIsEditingExplanation] = useState(!note.explanation);
  const explanationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultRomanization = useMemo(() => {
    if (!baseText.trim()) return "";
    const lang = noteLanguage === "zh-HK" ? "cantonese" : "mandarin";
    return smartRomanise(baseText, lang);
  }, [baseText, noteLanguage]);

  const defaultTranslation = useMemo(() => {
    if (!processed.sentences.length) return "";
    return processed.sentences
      .map((s, idx) => processed.batchTranslations.get(idx) ?? "")
      .filter((t) => t.trim().length > 0)
      .join(" ");
  }, [processed.sentences, processed.batchTranslations]);

  // Auto-persist generated translation so it's cached for future page loads
  const translationPersistedRef = useRef(false);
  useEffect(() => {
    if (
      !defaultTranslation ||
      note.translationOverride ||
      processed.isTranslating ||
      translationPersistedRef.current
    ) return;
    translationPersistedRef.current = true;
    fetch(`/api/coaching/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translationOverride: defaultTranslation }),
    }).catch(() => {});
  }, [defaultTranslation, note.translationOverride, note.id, processed.isTranslating]);

  useEffect(() => {
    if (!isEditing) return;
    setDraftText(baseText);
    setDraftRomanization(note.romanizationOverride ?? defaultRomanization);
    setDraftTranslation(note.translationOverride ?? defaultTranslation);
  }, [isEditing, baseText, note.romanizationOverride, note.translationOverride, defaultRomanization, defaultTranslation]);

  const handleSave = useCallback(() => {
    const nextText = draftText.trim();
    const nextRoman = draftRomanization.trim();
    const nextTrans = draftTranslation.trim();
    onSave({
      textOverride: nextText.length > 0 ? nextText : undefined,
      romanizationOverride: nextRoman.length > 0 ? nextRoman : undefined,
      translationOverride: nextTrans.length > 0 ? nextTrans : undefined,
    });
    setIsEditing(false);
  }, [draftText, draftRomanization, draftTranslation, onSave]);

  const handleRomanizationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const raw = el.value;
    // Only apply pinyin tone conversion for Mandarin — jyutping uses number tones as-is
    if (noteLanguage === "zh-HK") {
      setDraftRomanization(raw);
      return;
    }
    const converted = applyInlineTones(raw);
    setDraftRomanization(converted);
    // Adjust cursor if conversion shortened the string (e.g. "a1" → "ā")
    if (converted.length !== raw.length) {
      const cursor = (el.selectionStart ?? raw.length) - (raw.length - converted.length);
      requestAnimationFrame(() => {
        el.setSelectionRange(cursor, cursor);
      });
    }
  }, [noteLanguage]);

  const handleFetchTranslation = useCallback(async () => {
    const text = processed.displayText || baseText;
    if (!text.trim()) return;
    const cached = processed.translationCache.get(text);
    if (cached) {
      setShowTranslation((p) => !p);
      return;
    }
    setTranslationLoading(true);
    try {
      const res = await fetch("/api/reader/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: noteLanguage }),
      });
      if (res.ok) {
        const data = await res.json();
        processed.setTranslationCache((prev) => {
          const next = new Map(prev);
          next.set(text, data.translation);
          return next;
        });
        setShowTranslation(true);
      }
    } catch {
      // ignore
    } finally {
      setTranslationLoading(false);
    }
  }, [processed, baseText, noteLanguage]);

  const handleCopyOver = useCallback(async () => {
    if (!onCopyOver || isCopyingOver) return;
    setIsCopyingOver(true);
    try {
      onCopyOver();
    } finally {
      setIsCopyingOver(false);
    }
  }, [onCopyOver, isCopyingOver]);

  const handleExplanationSave = useCallback(() => {
    if (explanationTimerRef.current) clearTimeout(explanationTimerRef.current);
    onSaveExplanation?.(explanationDraft);
    setSavedExplanation(explanationDraft);
    setIsEditingExplanation(false);
  }, [onSaveExplanation, explanationDraft]);

  const handleExplanationCancel = useCallback(() => {
    if (explanationTimerRef.current) clearTimeout(explanationTimerRef.current);
    setExplanationDraft(savedExplanation);
    if (savedExplanation) {
      setIsEditingExplanation(false);
    } else {
      setShowExplanation(false);
    }
  }, [savedExplanation]);

  const annotationSize = Math.round(fontSize * 1.2);
  const englishSize = Math.round(fontSize * 1.1);

  return (
    <div className={cn("rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground", visualFontClass)}>
      <div className="flex items-start gap-2">
        <span className="self-center inline-flex min-w-5 justify-center text-[10px] text-muted-foreground">
          {index + 1}.
        </span>
        <div className="flex-1 space-y-2 min-w-0">
          {/* Action buttons — inline row, not absolute */}
          {(canEdit || canStar) && !isEditing && (
            <div className="flex items-center justify-end gap-1 -mt-0.5 -mb-1">
              {canStar && (
                <button
                  type="button"
                  onClick={onToggleStar}
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded text-[11px] transition-colors",
                    note.starred ? "text-amber-500" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Star note"
                  title="Star note"
                >
                  <Star className="size-3" />
                </button>
              )}
              {canEdit && (
                <>
                  {onCopyOver && (
                    <button
                      type="button"
                      onClick={handleCopyOver}
                      disabled={isCopyingOver}
                      className="inline-flex size-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:text-cyan-500 transition-colors disabled:opacity-50"
                      aria-label={`Translate to ${language === "zh-CN" ? "Cantonese" : "Mandarin"}`}
                      title={`Copy over to ${language === "zh-CN" ? "Cantonese" : "Mandarin"}`}
                    >
                      {isCopyingOver ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="size-3" />
                      )}
                    </button>
                  )}
                  {onSaveExplanation && (
                    <button
                      type="button"
                      onClick={() => setShowExplanation((p) => !p)}
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded text-[11px] transition-colors",
                        showExplanation || note.explanation
                          ? "text-violet-500"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label="Add notes"
                      title="Add notes / explanation"
                    >
                      <NotebookPen className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex size-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:text-foreground"
                    aria-label="Edit note"
                    title="Edit note"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex size-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:text-red-500"
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </>
              )}
            </div>
          )}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Chinese text"
              />
              <input
                ref={romanInputRef}
                value={draftRomanization}
                onChange={handleRomanizationChange}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={noteLanguage === "zh-HK" ? "Jyutping" : "Pinyin (type chang4 → chàng, nü3 → nǚ)"}
              />
              <textarea
                value={draftTranslation}
                onChange={(e) => setDraftTranslation(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="English translation"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : note.romanizationOverride || note.translationOverride || note.textOverride ? (
            <>
              {/* Render text with per-character aligned romanization */}
              {processed.segments.length > 0 ? (() => {
                // When romanization is overridden, distribute syllables to Han characters
                // for per-word alignment instead of a grouped sentence string
                const hasOverrideAnnotation = note.romanizationOverride && (showPinyin || showJyutping);
                const overrideSyllables = hasOverrideAnnotation
                  ? note.romanizationOverride!.split(/\s+/).filter(Boolean)
                  : [];
                // Build a lookup: for each Han char index in the full text, map to override syllable
                let overrideMap: Map<number, string> | null = null;
                if (hasOverrideAnnotation && overrideSyllables.length > 0) {
                  overrideMap = new Map();
                  const fullText = processed.displayText || baseText;
                  let syllableIdx = 0;
                  [...fullText].forEach((char, charIdx) => {
                    if (/\p{Script=Han}/u.test(char) && syllableIdx < overrideSyllables.length) {
                      overrideMap!.set(charIdx, overrideSyllables[syllableIdx++]);
                    }
                  });
                }

                // Track global char offset across segments
                let globalCharOffset = 0;

                return (
                  <span
                    className={cn(
                      (showPinyin || showJyutping)
                        ? "inline-flex items-end flex-wrap gap-y-1"
                        : "inline",
                    )}
                    style={{ fontSize: `${fontSize}px`, lineHeight: (showPinyin || showJyutping) ? "1.2" : "2" }}
                  >
                    {processed.segments.map((seg, i) => {
                      // If override exists, render per-char aligned override for this segment
                      if (overrideMap && seg.isWordLike) {
                        const segChars = [...seg.text];
                        const startOffset = globalCharOffset;
                        globalCharOffset += segChars.length;

                        const hasAnySyllable = segChars.some((_, ci) => overrideMap!.has(startOffset + ci));
                        if (!hasAnySyllable) {
                          if (toneColorsEnabled) {
                            const chars = [...seg.text];
                            const isCantonese = note.pane === "cantonese";
                            return (
                              <span key={i} data-word={seg.text} data-index={i}
                                className="cursor-pointer rounded px-0.5 transition-colors hover:bg-cyan-500/20">
                                {chars.map((c, ci) => {
                                  if (!/\p{Script=Han}/u.test(c)) return <span key={ci}>{c}</span>;
                                  let toneStyle: React.CSSProperties | undefined;
                                  if (isCantonese) {
                                    const jp = ToJyutping.getJyutpingList(c);
                                    const syl = jp?.[0]?.[1];
                                    if (syl) toneStyle = getToneColorStyle(extractToneFromJyutping(syl), "cantonese");
                                  } else {
                                    const py = pinyin(c, { toneType: "num", type: "array" })[0];
                                    if (py) toneStyle = getToneColorStyle(extractToneFromPinyin(py), "mandarin");
                                  }
                                  return <span key={ci} style={toneStyle}>{c}</span>;
                                })}
                              </span>
                            );
                          }
                          return (
                            <span key={i} data-word={seg.text} data-index={i}
                              className="cursor-pointer rounded px-0.5 transition-colors hover:bg-cyan-500/20">
                              {seg.text}
                            </span>
                          );
                        }

                        const annotationColor = showJyutping ? "text-orange-400" : "text-blue-400";
                        return (
                          <span key={i} data-word={seg.text} data-index={i}
                            className="cursor-pointer rounded px-0.5 transition-colors hover:bg-cyan-500/20 inline-flex flex-col items-center">
                            <span className="inline-flex items-end">
                              {segChars.map((char, ci) => {
                                const syllable = overrideMap!.get(startOffset + ci);
                                if (syllable) {
                                  const toneStyle = toneColorsEnabled
                                    ? (showJyutping
                                        ? getToneColorStyle(extractToneFromJyutping(syllable), "cantonese")
                                        : getToneColorStyle(extractToneFromPinyin(syllable), "mandarin"))
                                    : undefined;
                                  return (
                                    <span key={ci} className="inline-flex flex-col items-center" style={{ minWidth: "1.1em" }}>
                                      <span
                                        className={cn("text-center leading-tight select-none whitespace-nowrap", annotationColor)}
                                        style={{ fontSize: `${annotationSize}px` }}
                                      >
                                        {syllable}
                                      </span>
                                      <span style={toneStyle}>{char}</span>
                                    </span>
                                  );
                                }
                                return <span key={ci}>{char}</span>;
                              })}
                            </span>
                          </span>
                        );
                      }

                      // No override — use WordSpan for runtime-derived annotations
                      globalCharOffset += [...seg.text].length;
                      return (
                        <WordSpan
                          key={i}
                          text={seg.text}
                          index={i}
                          isWordLike={seg.isWordLike}
                          showPinyin={!note.romanizationOverride && showPinyin}
                          showJyutping={!note.romanizationOverride && showJyutping}
                          showEnglish={false}
                          fontSize={fontSize}
                          toneColorsEnabled={toneColorsEnabled}
                        />
                      );
                    })}
                  </span>
                );
              })() : (
                <div style={{ fontSize: `${fontSize}px` }} className="text-foreground">
                  {processed.displayText || baseText}
                </div>
              )}
              {/* Inline controls: play, speed, translate */}
              <span className="inline-flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => processed.handleSpeakSentence(
                    processed.displayText || baseText,
                    ttsRate,
                  )}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-cyan-500 transition-colors"
                  aria-label="Read aloud"
                >
                  {processed.ttsLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : processed.isPlaying ? (
                    <Square className="size-3" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                </button>
                <select
                  value={ttsRate}
                  onChange={(e) => setTtsRate(e.target.value as "slow" | "medium" | "fast")}
                  aria-label="Speaking speed"
                  className="h-6 text-[10px] bg-background border border-input rounded text-muted-foreground px-1 appearance-none cursor-pointer hover:border-primary/40 focus:outline-none focus:border-primary"
                >
                  <option value="slow">Slow</option>
                  <option value="medium">Normal</option>
                  <option value="fast">Fast</option>
                </select>
                <button
                  type="button"
                  onClick={handleFetchTranslation}
                  disabled={translationLoading}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-amber-500 transition-colors disabled:opacity-50"
                  aria-label="Translate to English"
                >
                  {translationLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Languages className="size-3.5" />
                  )}
                </button>
              </span>
              {/* On-demand translation */}
              {showTranslation && processed.translationCache.get(processed.displayText || baseText) && (
                <div className="italic mt-0.5 opacity-0 animate-[fadeIn_200ms_ease-out_forwards]" style={{ fontSize: `${englishSize}px` }}>
                  <span className="text-muted-foreground">
                    {processed.translationCache.get(processed.displayText || baseText)}
                  </span>
                </div>
              )}
              {/* Stored translation override */}
              {(note.translationOverride || defaultTranslation) && (
                <div className="italic text-emerald-500/80" style={{ fontSize: `${englishSize}px` }}>
                  {note.translationOverride ?? defaultTranslation}
                </div>
              )}
            </>
          ) : (
            <ReaderTextArea
              segments={processed.segments}
              showPinyin={showPinyin}
              showJyutping={showJyutping}
              showEnglish={true}
              translationMode="proper"
              fontSize={fontSize}
              language={language}
              onSpeakSentence={processed.handleSpeakSentence}
              isSpeaking={processed.isPlaying || processed.ttsLoading}
              speakingText={processed.speakingText}
              ttsError={processed.ttsError}
              translationCache={processed.translationCache}
              onTranslationFetched={(text, translation) => {
                processed.setTranslationCache((prev) => {
                  const next = new Map(prev);
                  next.set(text, translation);
                  return next;
                });
              }}
              batchTranslations={processed.batchTranslations}
              isTranslating={processed.isTranslating}
              toneColorsEnabled={toneColorsEnabled}
            />
          )}
          {/* Explanation / notes section */}
          {(showExplanation || (savedExplanation && !canEdit)) && (
            <div className="mt-2 border-t border-border/50 pt-2">
              {canEdit && onSaveExplanation ? (
                isEditingExplanation ? (
                  /* Edit mode: textarea + Save / Cancel */
                  <div className="space-y-1.5">
                    <textarea
                      value={explanationDraft}
                      onChange={(e) => setExplanationDraft(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full rounded-md border border-violet-500/25 bg-violet-500/5 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-y"
                      placeholder="Add notes or explanation for this entry..."
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleExplanationCancel}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleExplanationSave}
                        className="rounded px-2 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-500 hover:bg-violet-500/25 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode: saved text + Edit button */
                  <div className="group flex items-start gap-1.5">
                    <p className="flex-1 text-xs text-violet-400/80 whitespace-pre-wrap leading-relaxed">
                      {savedExplanation}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsEditingExplanation(true)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                    >
                      Edit
                    </button>
                  </div>
                )
              ) : savedExplanation ? (
                <p className="text-xs text-violet-400/80 whitespace-pre-wrap leading-relaxed">
                  {savedExplanation}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachingPanel({
  label,
  subtitle,
  sessionType,
  currentRole,
  initialStudentEmail,
}: {
  label: string;
  subtitle: string;
  sessionType: "one-on-one" | "inner-circle";
  currentRole?: "student" | "coach" | "admin";
  initialStudentEmail?: string;
}) {
  const fetchWithTimeout = useCallback(
    async (url: string, init?: RequestInit, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [],
  );

  const { user } = useUser();
  const { trackAction } = useFeatureEngagement(
    sessionType === "one-on-one"
      ? "coaching_one_on_one"
      : "coaching_inner_circle",
  );
  const { toneColorsEnabled } = useReaderPreferences();
  const roleFromMetadata = user?.publicMetadata?.role as string | undefined;
  const role = (currentRole || roleFromMetadata) as string | undefined;
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const canEditNotes = isAdmin || isCoach;
  const canWrite = canEditNotes;
  const canReorderNotes = isAdmin || isCoach || role === "student";
  const canStarNotes = isCoach || role === "student";
  const userEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [studentEmailFilter, setStudentEmailFilter] = useState("");
  const [studentEmailInput, setStudentEmailInput] = useState("");
  const [lockedStudentEmail, setLockedStudentEmail] = useState<string | null>(null);
  const [isLinkingStudent, setIsLinkingStudent] = useState(false);
  const [openStudentError, setOpenStudentError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Assigned students dropdown (for coaches on 1:1 page)
  const [assignedStudents, setAssignedStudents] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
  const [studentDropdownSearch, setStudentDropdownSearch] = useState("");
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState<{
    student: { id: string; name: string | null; email: string };
    duplicateCount: number;
  } | null>(null);
  const studentDropdownRef = useRef<HTMLDivElement>(null);
  // Font size for session notes — persist per coach via localStorage
  const [noteFontSize, setNoteFontSize] = useState(() => {
    if (typeof window === "undefined") return 18;
    const saved = localStorage.getItem("coaching-note-font-size");
    return saved ? Number(saved) : 18;
  });
  useEffect(() => {
    localStorage.setItem("coaching-note-font-size", String(noteFontSize));
  }, [noteFontSize]);

  // Panel collapse/resize state
  const [mandoCollapsed, setMandoCollapsed] = useState(false);
  const [cantoCollapsed, setCantoCollapsed] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  // Session rating state (only students can submit)
  const isStudent = role === "student";
  const [sessionRating, setSessionRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingHover, setRatingHover] = useState(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showRatingConfirm, setShowRatingConfirm] = useState(false);

  // Recording link state
  const [recordingUrlDraft, setRecordingUrlDraft] = useState("");
  const [isEditingRecordingUrl, setIsEditingRecordingUrl] = useState(false);
  const [isSavingRecordingUrl, setIsSavingRecordingUrl] = useState(false);

  // Fathom link state
  const [fathomLinkDraft, setFathomLinkDraft] = useState("");
  const [isEditingFathomLink, setIsEditingFathomLink] = useState(false);
  const [isSavingFathomLink, setIsSavingFathomLink] = useState(false);

  // Goals state — student-level (not session-level)
  const [studentGoals, setStudentGoals] = useState<string | null>(null);
  const [goalsDraft, setGoalsDraft] = useState("");
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  // Student level tracking
  const [studentLevel, setStudentLevel] = useState<string | null>(null);
  const [studentLessonNumber, setStudentLessonNumber] = useState<string | null>(null);
  const [levelSaveState, setLevelSaveState] = useState<"idle" | "editing" | "saving" | "saved" | "error">("idle");
  const [levelDraftLevel, setLevelDraftLevel] = useState("");
  const [levelDraftLesson, setLevelDraftLesson] = useState("");

  // Sync recording URL and fathom link when active session changes
  useEffect(() => {
    setRecordingUrlDraft(activeSession?.recordingUrl ?? "");
    setIsEditingRecordingUrl(false);
    setFathomLinkDraft(activeSession?.fathomLink ?? "");
    setIsEditingFathomLink(false);
  }, [activeSessionId]);

  // Fetch student goals when student changes (by email)
  const goalsStudentEmail = canWrite
    ? studentEmailFilter
    : userEmail;
  useEffect(() => {
    if (!goalsStudentEmail) {
      setStudentGoals(null);
      setStudentLevel(null);
      setStudentLessonNumber(null);
      return;
    }
    const params = new URLSearchParams({ studentEmail: goalsStudentEmail });
    // Fetch goals and level in parallel from separate endpoints
    Promise.all([
      fetch(`/api/coaching/goals?${params}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/coaching/student-level?${params}`).then((r) => r.ok ? r.json() : null),
    ]).then(([goalsData, levelData]) => {
      setStudentGoals(goalsData?.goals ?? null);
      setStudentLevel(levelData?.level ?? null);
      setStudentLessonNumber(levelData?.lessonNumber ?? null);
    }).catch(() => {});
  }, [goalsStudentEmail, canWrite]);

  const handleSaveLevel = useCallback(async () => {
    if (!goalsStudentEmail) return;
    setLevelSaveState("saving");
    try {
      const res = await fetch("/api/coaching/student-level", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentEmail: goalsStudentEmail,
          level: levelDraftLevel || null,
          lessonNumber: levelDraftLesson || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStudentLevel(data.level ?? null);
        setStudentLessonNumber(data.lessonNumber ?? null);
        setLevelSaveState("idle");
      } else {
        setLevelSaveState("editing");
      }
    } catch {
      setLevelSaveState("editing");
    }
  }, [goalsStudentEmail, levelDraftLevel, levelDraftLesson]);

  const handleSaveRecordingUrl = useCallback(async () => {
    if (!activeSessionId) return;
    setIsSavingRecordingUrl(true);
    try {
      const res = await fetch(`/api/coaching/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingUrl: recordingUrlDraft.trim() || null }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, recordingUrl: recordingUrlDraft.trim() || null }
              : s,
          ),
        );
        setIsEditingRecordingUrl(false);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingRecordingUrl(false);
    }
  }, [activeSessionId, recordingUrlDraft]);

  const handleSaveFathomLink = useCallback(async () => {
    if (!activeSessionId) return;
    setIsSavingFathomLink(true);
    try {
      const res = await fetch(`/api/coaching/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fathomLink: fathomLinkDraft.trim() || null }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, fathomLink: fathomLinkDraft.trim() || null }
              : s,
          ),
        );
        setIsEditingFathomLink(false);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingFathomLink(false);
    }
  }, [activeSessionId, fathomLinkDraft]);

  const handleSaveGoals = useCallback(async () => {
    if (!goalsStudentEmail) return;
    setIsSavingGoals(true);
    try {
      const res = await fetch("/api/coaching/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentEmail: goalsStudentEmail,
          goals: goalsDraft.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStudentGoals(data.goals ?? null);
        setIsEditingGoals(false);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingGoals(false);
    }
  }, [goalsStudentEmail, goalsDraft]);

  // Fetch existing rating when active session changes
  useEffect(() => {
    if (!isStudent || !activeSessionId) {
      setSessionRating(0);
      setRatingComment("");
      setRatingSubmitted(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/coaching/sessions/${activeSessionId}/rating`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.rating) {
          setSessionRating(data.rating.rating);
          setRatingComment(data.rating.comment || "");
          setRatingSubmitted(true);
        } else {
          setSessionRating(0);
          setRatingComment("");
          setRatingSubmitted(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isStudent, activeSessionId]);

  const handleSubmitRating = useCallback(async () => {
    if (!activeSessionId || sessionRating < 1) return;
    setIsSubmittingRating(true);
    setShowRatingConfirm(false);
    try {
      const res = await fetch(
        `/api/coaching/sessions/${activeSessionId}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating: sessionRating,
            comment: ratingComment.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setRatingSubmitted(true);
      }
    } catch {
      // ignore
    } finally {
      setIsSubmittingRating(false);
    }
  }, [activeSessionId, sessionRating, ratingComment]);

  const isOneOnOneSignedOut = sessionType === "one-on-one" && canWrite && !studentEmailFilter.trim();
  const canAddSession =
    canWrite && (sessionType !== "one-on-one" || Boolean(lockedStudentEmail));

  const normalizeSessions = useCallback((rawSessions: CoachingSession[]) => {
    return rawSessions.map((session: CoachingSession) => ({
      ...session,
      mandarin: session.mandarin ?? {
        draftText: "",
        committedText: "",
        scriptMode: "simplified",
      },
      cantonese: session.cantonese ?? {
        draftText: "",
        committedText: "",
        scriptMode: "simplified",
      },
    }));
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [sessions],
  );
  const visibleSessions = showAllSessions
    ? sortedSessions
    : sortedSessions.slice(0, 5);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );
  const mandarinNotes = useMemo(() => {
    const notes = (activeSession?.notes ?? []).filter((n) => n.pane === "mandarin");
    return [...notes].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }, [activeSession]);
  const cantoneseNotes = useMemo(() => {
    const notes = (activeSession?.notes ?? []).filter((n) => n.pane === "cantonese");
    return [...notes].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }, [activeSession]);

  useEffect(() => {
    if (sessionType === "one-on-one" && !canWrite && userEmail) {
      setStudentEmailFilter(userEmail);
      setStudentEmailInput(userEmail);
    }
  }, [sessionType, canWrite, userEmail]);

  // Fetch assigned students for the dropdown (coaches/admins on 1:1 page)
  useEffect(() => {
    if (sessionType !== "one-on-one" || !canWrite) return;
    fetch("/api/coach/my-students")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.students) setAssignedStudents(data.students);
      })
      .catch(() => {});
  }, [sessionType, canWrite]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(e.target as Node)) {
        setStudentDropdownOpen(false);
      }
    }
    if (studentDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [studentDropdownOpen]);

  // Filter assigned students by search term
  const filteredAssignedStudents = useMemo(() => {
    if (!studentDropdownSearch.trim()) return assignedStudents;
    const q = studentDropdownSearch.toLowerCase();
    return assignedStudents.filter(
      (s) =>
        (s.name?.toLowerCase().includes(q)) ||
        s.email.toLowerCase().includes(q),
    );
  }, [assignedStudents, studentDropdownSearch]);

  // Handle selecting a student from the dropdown
  const handleSelectAssignedStudent = useCallback(
    (student: { id: string; name: string | null; email: string }) => {
      // Check for duplicate names
      if (student.name) {
        const sameName = assignedStudents.filter(
          (s) => s.name?.toLowerCase() === student.name?.toLowerCase() && s.id !== student.id,
        );
        if (sameName.length > 0) {
          setShowDuplicateConfirm({
            student,
            duplicateCount: sameName.length + 1,
          });
          setStudentDropdownOpen(false);
          return;
        }
      }
      // No duplicates — open directly
      confirmSelectStudent(student.email);
    },
    [assignedStudents],
  );

  const confirmSelectStudent = useCallback(
    (email: string) => {
      setShowDuplicateConfirm(null);
      setStudentDropdownOpen(false);
      setStudentDropdownSearch("");
      setStudentEmailInput(email);
      setStudentEmailFilter(email);
      // Trigger the same flow as clicking "Open"
      setIsLinkingStudent(true);
      setOpenStudentError(null);
      const typeParam = "one_on_one";
      const params = new URLSearchParams({ type: typeParam, studentEmail: email });
      fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) {
            setOpenStudentError("Could not load sessions for that student.");
            return;
          }
          let data = await res.json();
          let normalized = normalizeSessions(data.sessions ?? []);
          if (normalized.length === 0 && canWrite) {
            const createRes = await fetchWithTimeout("/api/coaching/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "one_on_one", studentEmail: email }),
            });
            if (!createRes.ok) {
              setOpenStudentError("Could not create session for that student.");
              return;
            }
            const refetch = await fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`);
            if (!refetch.ok) return;
            data = await refetch.json();
            normalized = normalizeSessions(data.sessions ?? []);
          }
          setSessions(normalized);
          setActiveSessionId(normalized[0]?.id ?? null);
          setIsLoaded(true);
          setLockedStudentEmail(email);
          setOpenStudentError(null);
          trackAction("open_student_context", { studentEmail: email });
        })
        .catch(() => {
          setOpenStudentError("Could not open this student's sessions.");
        })
        .finally(() => {
          setIsLinkingStudent(false);
        });
    },
    [canWrite, fetchWithTimeout, normalizeSessions, trackAction],
  );

  // Auto-open student from URL query param (?student=email)
  const autoOpenTriggered = useRef(false);
  useEffect(() => {
    if (
      initialStudentEmail &&
      canWrite &&
      sessionType === "one-on-one" &&
      user &&
      !autoOpenTriggered.current &&
      !lockedStudentEmail
    ) {
      autoOpenTriggered.current = true;
      confirmSelectStudent(initialStudentEmail);
    }
  }, [initialStudentEmail, canWrite, sessionType, user, lockedStudentEmail, confirmSelectStudent]);

  const fetchSessions = useCallback(async () => {
    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam === "one_on_one" && canWrite && !studentEmailFilter.trim()) {
      setSessions([]);
      setActiveSessionId(null);
      setIsLoaded(true);
      return;
    }

    const params = new URLSearchParams({ type: typeParam });
    if (typeParam === "one_on_one" && studentEmailFilter) {
      params.set("studentEmail", studentEmailFilter);
    }
    const res = await fetch(`/api/coaching/sessions?${params.toString()}`);
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    const normalized = normalizeSessions(data.sessions ?? []);
    setSessions(normalized);
    setActiveSessionId((prev) => {
      // Preserve current session if it still exists, otherwise default to first
      if (prev && normalized.some((s) => s.id === prev)) return prev;
      return normalized[0]?.id ?? null;
    });
    setIsLoaded(true);
  }, [canWrite, normalizeSessions, sessionType, studentEmailFilter]);

  useEffect(() => {
    if (!user) return;
    fetchSessions();
    // Auto-refresh sessions every 15 seconds for near-real-time sync
    const interval = setInterval(fetchSessions, 15000);
    return () => clearInterval(interval);
  }, [fetchSessions, user]);

  const updateSession = useCallback(
    (sessionId: string, updater: (session: CoachingSession) => CoachingSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updater(s) : s)),
      );
    },
    [],
  );

  const handleAddSession = useCallback(async () => {
    if (!canAddSession) return;
    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam === "one_on_one" && !studentEmailFilter.trim()) {
      alert("Please enter a student email.");
      return;
    }
    const res = await fetch("/api/coaching/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: typeParam,
        studentEmail: typeParam === "one_on_one" ? studentEmailFilter.trim() : null,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    trackAction("create_session");
    await fetchSessions();
    // Auto-navigate to the newly created session
    if (data.session?.id) {
      setActiveSessionId(data.session.id);
    }
  }, [canAddSession, sessionType, studentEmailFilter, fetchSessions, trackAction]);

  const handleLinkStudentEmail = useCallback(async () => {
    if (lockedStudentEmail) {
      trackAction("sign_out_student_context");
      setLockedStudentEmail(null);
      setOpenStudentError(null);
      setStudentEmailFilter("");
      setStudentEmailInput("");
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    const email = studentEmailInput.trim().toLowerCase();
    if (!email) return;

    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam !== "one_on_one") return;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setOpenStudentError("Invalid email address input. Please try again.");
      setLockedStudentEmail(null);
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    setIsLinkingStudent(true);
    setOpenStudentError(null);
    setStudentEmailInput(email);
    setStudentEmailFilter(email);

    try {
      const params = new URLSearchParams({
        type: typeParam,
        studentEmail: email,
      });
      let res = await fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`);
      if (!res.ok) {
        alert("Could not load coaching sessions for that email.");
        return;
      }

      let data = await res.json();
      let normalized = normalizeSessions(data.sessions ?? []);

      if (normalized.length === 0 && canWrite) {
        const createRes = await fetchWithTimeout("/api/coaching/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "one_on_one",
            studentEmail: email,
          }),
        });

        if (!createRes.ok) {
          setOpenStudentError("Invalid email address input. Please try again.");
          setLockedStudentEmail(null);
          setSessions([]);
          setActiveSessionId(null);
          return;
        }

        res = await fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`);
        if (!res.ok) return;
        data = await res.json();
        normalized = normalizeSessions(data.sessions ?? []);
      }

      setSessions(normalized);
      setActiveSessionId(normalized[0]?.id ?? null);
      setIsLoaded(true);
      setLockedStudentEmail(email);
      setOpenStudentError(null);
      trackAction("open_student_context", { studentEmail: email });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Request timed out. Please try again."
          : "Could not open this 1:1 session.";
      alert(message);
    } finally {
      setIsLinkingStudent(false);
    }
  }, [canWrite, fetchWithTimeout, lockedStudentEmail, normalizeSessions, sessionType, studentEmailInput, trackAction]);

  const handleRenameSession = useCallback(
    async (sessionId: string, name: string) => {
      if (!canWrite) return;
      const res = await fetch(`/api/coaching/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim() || "Session" }),
      });
      if (!res.ok) return;
      await fetchSessions();
    },
    [canWrite, fetchSessions, updateSession],
  );

  const handleActivateSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  const handleCommitText = useCallback(
    async (sessionId: string, pane: "mandarin" | "cantonese", text: string) => {
      if (!canWrite) return;
      if (!text.trim()) return;
      updateSession(sessionId, (session) => ({
        ...session,
        [pane]: {
          ...session[pane],
          committedText: text,
          draftText: "",
        },
      }));
      const res = await fetch(`/api/coaching/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, pane }),
      });
      if (!res.ok) return;
      trackAction("add_note", { pane });
      await fetchSessions();
    },
    [canWrite, fetchSessions, trackAction, updateSession],
  );

  const handleReorderNotes = useCallback(
    (
      sessionId: string,
      pane: "mandarin" | "cantonese",
      fromIndex: number,
      toIndex: number,
    ) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const paneNotes = (session.notes ?? []).filter((n) => n.pane === pane);
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= paneNotes.length ||
        toIndex >= paneNotes.length
      ) {
        return;
      }
      const reordered = [...paneNotes];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      const updatedPaneNotes = reordered.map((note, idx) => ({
        ...note,
        order: reordered.length - idx,
      }));
      const noteIds = reordered.map((n) => n.id);

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const otherNotes = (s.notes ?? []).filter((n) => n.pane !== pane);
          return { ...s, notes: [...otherNotes, ...updatedPaneNotes] };
        }),
      );

      fetch(`/api/coaching/sessions/${sessionId}/notes/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds, pane }),
      }).catch(() => null);
    },
    [sessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!canWrite) return;
      const res = await fetch(`/api/coaching/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to delete session.");
        return;
      }
      trackAction("delete_session");
      await fetchSessions();
    },
    [canWrite, fetchSessions, trackAction],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!canEditNotes) return;
      const confirmed = window.confirm("Delete this note?");
      if (!confirmed) return;
      const res = await fetch(`/api/coaching/notes/${noteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to delete note.");
        return;
      }
      trackAction("delete_note");
      await fetchSessions();
    },
    [canEditNotes, fetchSessions, trackAction],
  );

  const mandarinPane = useProcessedText({
    committedText: activeSession?.mandarin.committedText ?? "",
    scriptMode: activeSession?.mandarin.scriptMode ?? "simplified",
    language: "zh-CN",
  });
  const [mandarinDraft, setMandarinDraft] = useState("");
  const [draggingMando, setDraggingMando] = useState<number | null>(null);
  const cantonesePane = useProcessedText({
    committedText: activeSession?.cantonese.committedText ?? "",
    scriptMode: activeSession?.cantonese.scriptMode ?? "simplified",
    language: "zh-HK",
  });
  const [cantoneseDraft, setCantoneseDraft] = useState("");
  const [draggingCanto, setDraggingCanto] = useState<number | null>(null);

  useEffect(() => {
    setMandarinDraft(activeSession?.mandarin.draftText ?? "");
    setCantoneseDraft(activeSession?.cantonese.draftText ?? "");
  }, [activeSessionId]);

  const handleStopAll = useCallback(() => {
    mandarinPane.handleStopAll();
    cantonesePane.handleStopAll();
  }, [mandarinPane.handleStopAll, cantonesePane.handleStopAll]);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showExportMenu]);

  const handleExport = useCallback(
    async (mode: "current" | "all") => {
      setIsExporting(true);
      setShowExportMenu(false);
      try {
        const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
        const params = new URLSearchParams({ type: typeParam, translate: "1" });
        if (mode === "current" && activeSessionId) {
          params.set("sessionId", activeSessionId);
        }
        if (sessionType === "one-on-one" && studentEmailFilter.trim()) {
          params.set("studentEmail", studentEmailFilter.trim());
        }

        const res = await fetch(`/api/coaching/export?${params.toString()}`);
        if (!res.ok) {
          console.error("Export fetch failed:", res.status);
          alert(`Export failed (${res.status}). Please try again.`);
          return;
        }
        const data = await res.json();
        const exportSessions = (data.sessions ?? []).map(
          (s: { title: string; studentEmail?: string; fathomLink?: string; recordingUrl?: string; notes: Array<{ text: string; pane: string; textOverride?: string; romanizationOverride?: string; translationOverride?: string; explanation?: string | null }> }) => ({
            title: s.title,
            studentEmail: s.studentEmail,
            fathomLink: s.fathomLink,
            recordingUrl: s.recordingUrl,
            notes: s.notes.map((n) => ({
              text: n.text,
              pane: n.pane as "mandarin" | "cantonese",
              textOverride: n.textOverride,
              romanizationOverride: n.romanizationOverride,
              translationOverride: n.translationOverride,
              explanation: n.explanation,
            })),
          }),
        );

        if (exportSessions.length === 0) {
          alert("No sessions found to export.");
          return;
        }

        const sessionTitle =
          mode === "current" && activeSession
            ? activeSession.title
            : undefined;

        await exportCoachingNotes(exportSessions, {
          sessionTitle,
          fileName: mode === "current" && activeSession
            ? `coaching-notes-${activeSession.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`
            : `coaching-notes-${typeParam}${studentEmailFilter.trim() ? `-${studentEmailFilter.trim()}` : ""}.xlsx`,
        });
      } catch (err) {
        console.error("Export error:", err);
        alert("Export failed. Please try again.");
      } finally {
        setIsExporting(false);
      }
    },
    [sessionType, activeSessionId, activeSession, studentEmailFilter, fetchWithTimeout],
  );

  // Panel resize drag handlers
  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(20, Math.min(80, pct)));
    };
    const onUp = () => {
      splitDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: title + subtitle */}
          <div className="shrink-0">
            <h2 className="text-lg font-semibold text-foreground">{label}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Right: Goals + Level widget — student-level, shown when a student is loaded */}
          {goalsStudentEmail && sessionType === "one-on-one" && (
            <div className="lg:max-w-[60%] w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Goals card */}
              <div className="rounded-lg border border-teal-500/25 bg-gradient-to-br from-teal-500/10 to-cyan-500/10 dark:from-teal-500/[0.07] dark:to-cyan-500/[0.07] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                    Goals this week
                  </h3>
                  {canWrite && !isEditingGoals && (
                    <button
                      type="button"
                      onClick={() => { setGoalsDraft(studentGoals ?? ""); setIsEditingGoals(true); }}
                      className="text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                </div>
                {isEditingGoals ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <textarea
                      value={goalsDraft}
                      onChange={(e) => setGoalsDraft(e.target.value)}
                      placeholder="e.g. Practice tones 1-4, complete Lesson 3..."
                      rows={2}
                      className="w-full rounded-md border border-teal-500/25 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleSaveGoals} disabled={isSavingGoals}
                        className="rounded-md bg-teal-500 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-teal-600 transition-colors disabled:opacity-50">
                        {isSavingGoals ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={() => setIsEditingGoals(false)}
                        className="rounded-md border border-input bg-background px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : studentGoals ? (
                  <p className="mt-1.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {studentGoals}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[10px] text-teal-600/60 dark:text-teal-400/50">
                    {canWrite ? "Click edit to set goals." : "No goals set yet."}
                  </p>
                )}
              </div>

              {/* Current Progress card */}
              <div className="rounded-lg border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 dark:from-indigo-500/[0.07] dark:to-violet-500/[0.07] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    Current Progress
                  </h3>
                  {canWrite && levelSaveState !== "editing" && (
                    <button
                      type="button"
                      onClick={() => {
                        setLevelDraftLevel(studentLevel ?? "");
                        setLevelDraftLesson(studentLessonNumber ?? "");
                        setLevelSaveState("editing");
                      }}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                </div>
                {levelSaveState === "editing" ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <select
                      value={levelDraftLevel}
                      onChange={(e) => setLevelDraftLevel(e.target.value)}
                      className="w-full h-8 rounded-md border border-indigo-500/25 bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    >
                      <option value="">Select level...</option>
                      <option value="CMB Foundation">CMB Foundation</option>
                      <option value="CMB Intermediate">CMB Intermediate</option>
                      <option value="CMB Advanced">CMB Advanced</option>
                      <option value="Canto Kickstarter">Canto Kickstarter</option>
                      <option value="Completed CMB">Completed CMB</option>
                      <option value="Completed Canto Kickstarter">Completed Canto Kickstarter</option>
                    </select>
                    <input
                      value={levelDraftLesson}
                      onChange={(e) => setLevelDraftLesson(e.target.value)}
                      placeholder="Lesson / Chapter number"
                      className="w-full h-8 rounded-md border border-indigo-500/25 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleSaveLevel}
                        className="rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-indigo-600 transition-colors disabled:opacity-50">
                        Save
                      </button>
                      <button type="button" onClick={() => setLevelSaveState("idle")}
                        className="rounded-md border border-input bg-background px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (studentLevel || studentLessonNumber) ? (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs font-medium text-foreground">{studentLevel || ""}</p>
                    {studentLessonNumber && (
                      <p className="text-xs text-muted-foreground">Chapter / Lesson: {studentLessonNumber}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[10px] text-indigo-600/60 dark:text-indigo-400/50">
                    {canWrite ? "Click edit to set progress." : "Not set yet."}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>



      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Sessions</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Most recent sessions appear at the top.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={isExporting || sessions.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export notes to Excel"
              >
                <Download className="size-3.5" />
                {isExporting ? "Exporting..." : "Export"}
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
                  <button
                    type="button"
                    onClick={() => handleExport("current")}
                    disabled={!activeSessionId}
                    className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Export current session
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("all")}
                    className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    Export all sessions
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleAddSession}
              disabled={!canAddSession}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add New Session
            </button>
          </div>
        </div>
        {sessionType === "one-on-one" && canWrite && (
          <div className="mt-3 space-y-2">
            {/* Row 1: Assigned students quick-select dropdown */}
            {assignedStudents.length > 0 && !lockedStudentEmail && (
              <div className="relative" ref={studentDropdownRef}>
                <button
                  type="button"
                  onClick={() => setStudentDropdownOpen((p) => !p)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
                >
                  <Users className="size-3.5" />
                  {isAdmin ? "All Students" : "My Students"} ({assignedStudents.length})
                  <ChevronDown className={cn("size-3 transition-transform", studentDropdownOpen && "rotate-180")} />
                </button>
                {studentDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md border border-border bg-popover shadow-lg">
                    <div className="p-2 border-b border-border">
                      <input
                        type="text"
                        value={studentDropdownSearch}
                        onChange={(e) => setStudentDropdownSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {filteredAssignedStudents.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No students found.
                        </div>
                      ) : (
                        filteredAssignedStudents.map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => handleSelectAssignedStudent(student)}
                            className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                          >
                            <div className="text-xs font-medium text-foreground">
                              {student.name || student.email.split("@")[0]}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {student.email}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Duplicate name confirmation dialog */}
            {showDuplicateConfirm && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                <p className="text-xs text-foreground">
                  You have <strong>{showDuplicateConfirm.duplicateCount}</strong> students named{" "}
                  <strong>{showDuplicateConfirm.student.name}</strong> on your list.
                  The one you are selecting now&apos;s email address is{" "}
                  <strong>{showDuplicateConfirm.student.email}</strong>.
                  Are you sure this is the right one?
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => confirmSelectStudent(showDuplicateConfirm.student.email)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Yes, open
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDuplicateConfirm(null)}
                    className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Row 2: Email input (works for any student) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs font-medium text-muted-foreground">
                Student Email
              </label>
              <input
                value={studentEmailInput}
                onChange={(e) => setStudentEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (lockedStudentEmail) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleLinkStudentEmail();
                  }
                }}
                disabled={Boolean(lockedStudentEmail)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="student@email.com"
              />
              <button
                type="button"
                onClick={handleLinkStudentEmail}
                disabled={(!studentEmailInput.trim() && !lockedStudentEmail) || isLinkingStudent}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinkingStudent ? "Opening..." : lockedStudentEmail ? "Sign out" : "Open"}
              </button>
            </div>
          </div>
        )}
        <div className={cn("mt-3", showAllSessions && "max-h-[200px] overflow-y-auto pr-1")}>
          {sortedSessions.length === 0 && (
            <div
              className={cn(
                "text-xs",
                openStudentError ? "text-red-500" : "text-muted-foreground",
              )}
            >
              {openStudentError
                ? openStudentError
                : sessionType === "one-on-one" && canWrite && !studentEmailFilter.trim()
                ? "Please type in the student email to access student's 1:1 coaching note."
                : "No sessions yet. Add a new session to begin."}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {visibleSessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors",
                  session.id === activeSessionId
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleActivateSession(session.id)}
                  className="w-full text-left"
                >
                  <span className="font-medium">{session.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleString()}
                  </span>
                </button>
                {canWrite && (
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(session.id);
                        setEditingSessionName(session.title);
                      }}
                      className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="Rename session"
                      title="Rename session"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(session.id);
                      }}
                      className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )}
                {canWrite && pendingDeleteId === session.id && (
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="text-red-500/80">Delete this session?</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                        setPendingDeleteId(null);
                      }}
                      className="rounded border border-red-500/40 px-1.5 py-0.5 text-red-500 hover:border-red-500/70"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(null);
                      }}
                      className="rounded border border-input px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {sortedSessions.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllSessions((prev) => !prev)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAllSessions ? "Collapse" : "Show All Sessions"}
            </button>
          )}
        </div>

        {editingSessionId && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs font-medium text-muted-foreground">
              Rename Session
            </label>
            <input
              value={editingSessionName}
              onChange={(e) => setEditingSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRenameSession(editingSessionId, editingSessionName);
                  setEditingSessionId(null);
                  setEditingSessionName("");
                }
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm"
            />
            <button
              type="button"
              onClick={() => {
                handleRenameSession(editingSessionId, editingSessionName);
                setEditingSessionId(null);
                setEditingSessionName("");
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSessionId(null);
                setEditingSessionName("");
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Recording Link Section */}
      {activeSession && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Recording Link</h3>
            </div>
            {canWrite && !isEditingRecordingUrl && (
              <button
                type="button"
                onClick={() => {
                  setRecordingUrlDraft(activeSession.recordingUrl ?? "");
                  setIsEditingRecordingUrl(true);
                }}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <Pencil className="size-3 mr-1" />
                {activeSession.recordingUrl ? "Edit" : "Add Link"}
              </button>
            )}
          </div>
          {isEditingRecordingUrl ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={recordingUrlDraft}
                onChange={(e) => setRecordingUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveRecordingUrl();
                  }
                }}
                placeholder="https://..."
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-md"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveRecordingUrl}
                  disabled={isSavingRecordingUrl}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {isSavingRecordingUrl ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingRecordingUrl(false)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : activeSession.recordingUrl ? (
            <a
              href={activeSession.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {activeSession.recordingUrl}
            </a>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No recording link added yet.
            </p>
          )}
        </div>
      )}


      <div ref={splitContainerRef} className="flex gap-0 lg:flex-row flex-col">
        {/* Mandarin Panel */}
        <div
          className={cn(
            "rounded-lg border border-border bg-card transition-all overflow-hidden",
            cantoCollapsed ? "flex-1" : mandoCollapsed ? "w-10 min-w-10 lg:flex-none" : "lg:flex-none",
            !mandoCollapsed && "p-4",
          )}
          style={!mandoCollapsed && !cantoCollapsed ? { width: `calc(${splitPercent}% - 8px)` } : mandoCollapsed ? {} : {}}
        >
          {mandoCollapsed ? (
            <button
              type="button"
              onClick={() => setMandoCollapsed(false)}
              className="flex flex-col items-center justify-center w-full h-full min-h-[200px] gap-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand Mandarin panel"
            >
              <PanelRightOpen className="size-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-lr]">Mandarin</span>
            </button>
          ) : (
          <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMandoCollapsed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Collapse Mandarin panel"
              >
                <PanelLeftClose className="size-4" />
              </button>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Mandarin Output
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Simplified/Traditional display with Pinyin and Mandarin → English translation.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, scriptMode: "simplified" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.mandarin.scriptMode === "simplified"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Simplified
              </button>
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, scriptMode: "traditional" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.mandarin.scriptMode === "traditional"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Traditional
              </button>
            </div>
          </div>

          {/* Font size control — Mandarin panel */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-muted-foreground">Font size</span>
            <button
              type="button"
              onClick={() => setNoteFontSize((s) => Math.max(12, s - 2))}
              disabled={noteFontSize <= 12}
              className="inline-flex items-center justify-center size-6 rounded border border-input bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              aria-label="Decrease font size"
            >
              <Minus className="size-3" />
            </button>
            <span className="text-xs tabular-nums text-foreground w-8 text-center">{noteFontSize}</span>
            <button
              type="button"
              onClick={() => setNoteFontSize((s) => Math.min(32, s + 2))}
              disabled={noteFontSize >= 32}
              className="inline-flex items-center justify-center size-6 rounded border border-input bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              aria-label="Increase font size"
            >
              <Plus className="size-3" />
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Traditional Chinese Input (Mandarin)
            </label>
            <div className="relative">
              <textarea
              value={mandarinDraft}
              onChange={(e) => {
                const next = e.target.value;
                setMandarinDraft(next);
                if (activeSession) {
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, draftText: next },
                  }));
                }
              }}
              onKeyDown={(e) => {
                if (!canWrite) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeSession) {
                    handleCommitText(activeSession.id, "mandarin", mandarinDraft);
                    setMandarinDraft("");
                  }
                }
              }}
              disabled={!activeSession || !canWrite}
              rows={1}
              placeholder="Paste or type Traditional Chinese here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) {
                      handleCommitText(activeSession.id, "mandarin", mandarinDraft);
                      setMandarinDraft("");
                    }
                  }}
                  disabled={!activeSession}
                  className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enter
                </button>
              )}
            </div>
          </div>

          {(mandarinPane.isConverting || mandarinPane.isSegmenting) && (
            <div className="mt-3 text-sm text-muted-foreground">
              {mandarinPane.isConverting ? "Converting..." : "Segmenting..."}
            </div>
          )}

          {activeSession && mandarinNotes.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Session Notes (Mandarin)
              </div>
              <div className="space-y-2">
                {mandarinNotes.map((note, index) => (
                  <div
                    key={note.id}
                    draggable={canReorderNotes}
                    onDragStart={() => {
                      if (canReorderNotes) setDraggingMando(index);
                    }}
                    onDragOver={(e) => {
                      if (canReorderNotes) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (canReorderNotes && draggingMando !== null && activeSession) {
                        handleReorderNotes(
                          activeSession.id,
                          "mandarin",
                          draggingMando,
                          index,
                        );
                        setDraggingMando(null);
                      }
                    }}
                    className={cn(
                      canReorderNotes ? "cursor-move" : "cursor-default",
                    )}
                  >
                    <NoteCard
                      note={note}
                      index={index}
                      language="zh-CN"
                      scriptMode={activeSession.mandarin.scriptMode}
                      showPinyin={true}
                      showJyutping={false}
                      canEdit={canEditNotes}
                      canStar={canStarNotes}
                      fontSize={noteFontSize}
                      onToggleStar={() => {
                        if (!activeSession) return;
                        if (!canStarNotes) return;
                        const method = note.starred === 1 ? "DELETE" : "POST";
                        fetch(`/api/coaching/notes/${note.id}/star`, {
                          method,
                        }).then(() => fetchSessions());
                      }}
                      onSave={(updates) => {
                        if (!activeSession) return;
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(updates),
                        }).then(() => fetchSessions());
                      }}
                      onDelete={() => {
                        void handleDeleteNote(note.id);
                      }}
                      onCopyOver={canEditNotes ? async () => {
                        if (!activeSession) return;
                        const sourceText = note.textOverride ?? note.text;
                        try {
                          const res = await fetch("/api/coaching/translate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              text: sourceText,
                              fromLang: "mandarin",
                              toLang: "cantonese",
                            }),
                          });
                          if (!res.ok) return;
                          const data = await res.json();
                          if (!data.translated) return;
                          await fetch(`/api/coaching/sessions/${activeSession.id}/notes`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: data.translated, pane: "cantonese" }),
                          });
                          await fetchSessions();
                        } catch {
                          // ignore
                        }
                      } : undefined}
                      onSaveExplanation={canEditNotes ? (explanation) => {
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ explanation: explanation.trim() || null }),
                        }).catch(() => null);
                      } : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {mandarinPane.segments.length > 0 ? (
            <div className="mt-3">
              <ReaderTextArea
                segments={mandarinPane.segments}
                showPinyin={true}
                showJyutping={false}
                showEnglish={true}
                translationMode="proper"
                fontSize={noteFontSize}
                language="zh-CN"
                onSpeakSentence={mandarinPane.handleSpeakSentence}
                isSpeaking={mandarinPane.isPlaying || mandarinPane.ttsLoading}
                speakingText={mandarinPane.speakingText}
                ttsError={mandarinPane.ttsError}
                translationCache={mandarinPane.translationCache}
                onTranslationFetched={(text, translation) => {
                  mandarinPane.setTranslationCache((prev) => {
                    const next = new Map(prev);
                    next.set(text, translation);
                    return next;
                  });
                }}
                batchTranslations={mandarinPane.batchTranslations}
                isTranslating={mandarinPane.isTranslating}
                toneColorsEnabled={toneColorsEnabled}
              />
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Paste or import Chinese text to begin reading
            </div>
          )}
          </>
          )}
        </div>

        {/* Resize divider (visible on lg screens when both panels open) */}
        {!mandoCollapsed && !cantoCollapsed && (
          <div
            className="hidden lg:flex items-center justify-center w-4 flex-shrink-0 cursor-col-resize group select-none"
            onMouseDown={handleSplitMouseDown}
          >
            <div className="w-1 h-16 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>
        )}

        {/* Cantonese Panel */}
        <div
          className={cn(
            "rounded-lg border border-border bg-card transition-all overflow-hidden flex-1",
            mandoCollapsed ? "flex-1" : cantoCollapsed ? "w-10 min-w-10 lg:flex-none" : "",
            !cantoCollapsed && "p-4",
          )}
          style={!mandoCollapsed && !cantoCollapsed ? { width: `calc(${100 - splitPercent}% - 8px)` } : cantoCollapsed ? {} : {}}
        >
          {cantoCollapsed ? (
            <button
              type="button"
              onClick={() => setCantoCollapsed(false)}
              className="flex flex-col items-center justify-center w-full h-full min-h-[200px] gap-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand Cantonese panel"
            >
              <PanelLeftOpen className="size-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-lr]">Cantonese</span>
            </button>
          ) : (
          <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCantoCollapsed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Collapse Cantonese panel"
              >
                <PanelRightClose className="size-4" />
              </button>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Cantonese Output
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Simplified/Traditional display with Jyutping and Cantonese → English translation.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, scriptMode: "simplified" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.cantonese.scriptMode === "simplified"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Simplified
              </button>
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, scriptMode: "traditional" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.cantonese.scriptMode === "traditional"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Traditional
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Traditional Chinese Input (Cantonese)
            </label>
            <div className="relative">
              <textarea
              value={cantoneseDraft}
              onChange={(e) => {
                const next = e.target.value;
                setCantoneseDraft(next);
                if (activeSession) {
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, draftText: next },
                  }));
                }
              }}
              onKeyDown={(e) => {
                if (!canWrite) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeSession) {
                    handleCommitText(activeSession.id, "cantonese", cantoneseDraft);
                    setCantoneseDraft("");
                  }
                }
              }}
              disabled={!activeSession || !canWrite}
              rows={1}
              placeholder="Paste or type Traditional Chinese here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) {
                      handleCommitText(activeSession.id, "cantonese", cantoneseDraft);
                      setCantoneseDraft("");
                    }
                  }}
                  disabled={!activeSession}
                  className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enter
                </button>
              )}
            </div>
          </div>

          {(cantonesePane.isConverting || cantonesePane.isSegmenting) && (
            <div className="mt-3 text-sm text-muted-foreground">
              {cantonesePane.isConverting ? "Converting..." : "Segmenting..."}
            </div>
          )}

          {activeSession && cantoneseNotes.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Session Notes (Cantonese)
              </div>
              <div className="space-y-2">
                {cantoneseNotes.map((note, index) => (
                  <div
                    key={note.id}
                    draggable={canReorderNotes}
                    onDragStart={() => {
                      if (canReorderNotes) setDraggingCanto(index);
                    }}
                    onDragOver={(e) => {
                      if (canReorderNotes) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (canReorderNotes && draggingCanto !== null && activeSession) {
                        handleReorderNotes(
                          activeSession.id,
                          "cantonese",
                          draggingCanto,
                          index,
                        );
                        setDraggingCanto(null);
                      }
                    }}
                    className={cn(
                      canReorderNotes ? "cursor-move" : "cursor-default",
                    )}
                  >
                    <NoteCard
                      note={note}
                      index={index}
                      language="zh-HK"
                      scriptMode={activeSession.cantonese.scriptMode}
                      showPinyin={false}
                      showJyutping={true}
                      canEdit={canEditNotes}
                      canStar={canStarNotes}
                      fontSize={noteFontSize}
                      onToggleStar={() => {
                        if (!activeSession) return;
                        if (!canStarNotes) return;
                        const method = note.starred === 1 ? "DELETE" : "POST";
                        fetch(`/api/coaching/notes/${note.id}/star`, {
                          method,
                        }).then(() => fetchSessions());
                      }}
                      onSave={(updates) => {
                        if (!activeSession) return;
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(updates),
                        }).then(() => fetchSessions());
                      }}
                      onDelete={() => {
                        void handleDeleteNote(note.id);
                      }}
                      onCopyOver={canEditNotes ? async () => {
                        if (!activeSession) return;
                        const sourceText = note.textOverride ?? note.text;
                        try {
                          const res = await fetch("/api/coaching/translate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              text: sourceText,
                              fromLang: "cantonese",
                              toLang: "mandarin",
                            }),
                          });
                          if (!res.ok) return;
                          const data = await res.json();
                          if (!data.translated) return;
                          await fetch(`/api/coaching/sessions/${activeSession.id}/notes`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: data.translated, pane: "mandarin" }),
                          });
                          await fetchSessions();
                        } catch {
                          // ignore
                        }
                      } : undefined}
                      onSaveExplanation={canEditNotes ? (explanation) => {
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ explanation: explanation.trim() || null }),
                        }).catch(() => null);
                      } : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {cantonesePane.segments.length > 0 ? (
            <div className="mt-3">
              <ReaderTextArea
                segments={cantonesePane.segments}
                showPinyin={false}
                showJyutping={true}
                showEnglish={true}
                translationMode="proper"
                fontSize={noteFontSize}
                language="zh-HK"
                onSpeakSentence={cantonesePane.handleSpeakSentence}
                isSpeaking={cantonesePane.isPlaying || cantonesePane.ttsLoading}
                speakingText={cantonesePane.speakingText}
                ttsError={cantonesePane.ttsError}
                translationCache={cantonesePane.translationCache}
                onTranslationFetched={(text, translation) => {
                  cantonesePane.setTranslationCache((prev) => {
                    const next = new Map(prev);
                    next.set(text, translation);
                    return next;
                  });
                }}
                batchTranslations={cantonesePane.batchTranslations}
                isTranslating={cantonesePane.isTranslating}
                toneColorsEnabled={toneColorsEnabled}
              />
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Paste or import Chinese text to begin reading
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Session Feedback Section */}
      {activeSession && (
        <div className={cn(
          "rounded-lg border border-border bg-card p-4",
          !isStudent && "opacity-50",
        )}>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {ratingSubmitted ? "Your feedback" : "Rate this session"}
          </h3>

          {!isStudent && (
            <p className="text-xs text-muted-foreground mb-2">
              Only students can submit session feedback.
            </p>
          )}

          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => {
                  if (!isStudent || ratingSubmitted) return;
                  setSessionRating(star);
                }}
                onMouseEnter={() => {
                  if (isStudent && !ratingSubmitted) setRatingHover(star);
                }}
                onMouseLeave={() => setRatingHover(0)}
                disabled={!isStudent || ratingSubmitted}
                className={cn(
                  "p-0.5 transition-colors",
                  (!isStudent || ratingSubmitted) && "cursor-default",
                )}
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={cn(
                    "h-5 w-5 transition-colors",
                    (ratingHover || sessionRating) >= star
                      ? "fill-amber-400 text-amber-400"
                      : "fill-none text-muted-foreground",
                  )}
                />
              </button>
            ))}
            {sessionRating > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                {sessionRating}/5
              </span>
            )}
          </div>

          {ratingSubmitted ? (
            <div className="space-y-2">
              {ratingComment && (
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{ratingComment}&rdquo;
                </p>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                Feedback submitted
              </span>
            </div>
          ) : isStudent ? (
            <>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Optional: share your feedback..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowRatingConfirm(true)}
                  disabled={sessionRating < 1 || isSubmittingRating}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingRating ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Confirmation dialog before submitting feedback */}
      {showRatingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRatingConfirm(false)}
          />
          <div className="relative mx-4 w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
              Submit feedback?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Once submitted, your rating and feedback cannot be changed. Are you sure you want to continue?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRatingConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRating}
                disabled={isSubmittingRating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmittingRating ? "Submitting..." : "Yes, Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CoachingMaterialClient({
  title,
  subtitle,
  sessionType,
  currentRole,
  initialStudentEmail,
}: {
  title: string;
  subtitle: string;
  sessionType: "one-on-one" | "inner-circle";
  currentRole?: "student" | "coach" | "admin";
  initialStudentEmail?: string;
}) {
  return (
    <div className="container mx-auto px-4 py-6 flex flex-col min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>

      <div className="mt-4">
        <CoachingPanel
          label={title}
          subtitle={subtitle}
          sessionType={sessionType}
          currentRole={currentRole}
          initialStudentEmail={initialStudentEmail}
        />
      </div>

      <div className="pt-6 mt-auto border-t border-border text-xs text-muted-foreground">
        This is an AI-assisted product. We do not guarantee accuracy or
        completeness. Please verify important information independently.
      </div>
    </div>
  );
}
