"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import { useCharacterPopup } from "@/hooks/useCharacterPopup";
import { useTTS } from "@/hooks/useTTS";
import { segmentText, type WordSegment } from "@/lib/segmenter";
import { convertScript } from "@/lib/chinese-convert";
import { detectSentences } from "@/lib/sentences";
import { ImportDialog } from "@/components/reader/ImportDialog";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { CharacterPopup } from "@/components/reader/CharacterPopup";
import { ProductWalkthrough, type WalkthroughStep } from "@/components/onboarding/ProductWalkthrough";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeatureEngagement } from "@/hooks/useFeatureEngagement";

// Fetch jieba segments from API, falling back to client-side Intl.Segmenter
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

// Batch translate sentences (proper mode)
async function fetchProperTranslations(
  texts: string[],
  language: "zh-CN" | "zh-HK",
): Promise<string[] | null> {
  try {
    const cleanTexts = texts.map((t) =>
      t.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim(),
    ).filter((t) => t.length > 0);
    if (cleanTexts.length === 0) return null;

    const res = await fetch("/api/reader/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: cleanTexts, mode: "proper", language }),
    });
    if (!res.ok) {
      console.error("Batch translate failed (proper):", res.status);
      return null;
    }
    const data = await res.json();
    return data.translations ?? null;
  } catch (err) {
    console.error("Batch translate error (proper):", err);
    return null;
  }
}

// Dictionary lookup for individual words (direct mode)
async function fetchWordGlosses(
  words: string[],
  language: "zh-CN" | "zh-HK",
): Promise<Record<string, string> | null> {
  try {
    const cleanWords = words.map((w) =>
      w.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim(),
    ).filter((w) => w.length > 0);
    if (cleanWords.length === 0) return null;

    const res = await fetch("/api/reader/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: cleanWords, mode: "words", language }),
    });
    if (!res.ok) {
      console.error("Word glosses failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.glosses ?? null;
  } catch (err) {
    console.error("Word glosses error:", err);
    return null;
  }
}

async function fetchSingleTranslation(
  text: string,
  language: "zh-CN" | "zh-HK",
): Promise<string | null> {
  try {
    const cleanText = text.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim();
    if (!cleanText) return null;

    const res = await fetch("/api/reader/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanText, language }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.translation === "string" ? data.translation : null;
  } catch {
    return null;
  }
}

function normalizeSentenceForTranslation(text: string): string {
  return text.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim();
}

export function ReaderClient({ initialText }: { initialText?: string }) {
  const { trackAction } = useFeatureEngagement("ai_passage_reader");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const canRunWalkthrough = Boolean(user);
  const onboardingDoneKey = `cmb.onboarding.walkthrough.done.v1.${user?.id ?? "anonymous"}`;
  const isOnboardingLaunch = searchParams.get("onboarding") === "1";
  const [hasOpenedImportForTour, setHasOpenedImportForTour] = useState(false);
  const [importClickSignal, setImportClickSignal] = useState(0);
  const [generateTabClickSignal, setGenerateTabClickSignal] = useState(0);
  const [hasPickedBeginnerForTour, setHasPickedBeginnerForTour] = useState(false);
  const [beginnerClickSignal, setBeginnerClickSignal] = useState(0);
  const [hasGeneratedFromImportForTour, setHasGeneratedFromImportForTour] =
    useState(false);
  const [generateActionSignal, setGenerateActionSignal] = useState(0);
  const [hasClickedFirstSentenceForTour, setHasClickedFirstSentenceForTour] =
    useState(false);
  const [hasPlayedFirstSentenceForTour, setHasPlayedFirstSentenceForTour] =
    useState(false);
  const [activeReaderStepId, setActiveReaderStepId] = useState<string | null>(null);
  const [importTabForTour, setImportTabForTour] = useState<
    "paste" | "file" | "generate"
  >("paste");
  const [forcedImportTabForTour, setForcedImportTabForTour] = useState<
    "paste" | "file" | "generate"
  >("paste");

  const {
    showPinyin,
    showJyutping,
    showEnglish,
    translationMode,
    scriptMode,
    fontSize,
    ttsLanguage,
    setShowPinyin,
    setShowJyutping,
    setShowEnglish,
    setTranslationMode,
    setScriptMode,
    setFontSize,
    setTtsLanguage,
  } = useReaderPreferences(user?.id);

  const walkthroughSteps = useMemo<WalkthroughStep[]>(
    () => [
      {
        id: "reader-intro",
        title: "AI Passage Reader",
        description: "This workspace helps you read Chinese with instant annotation, translation, and audio.",
        target: "[data-tour-id='reader-title']",
      },
      {
        id: "reader-toolbar",
        title: "Main Controls",
        description: "Use these controls to import text, switch script, toggle annotations, and play audio.",
        target: "[data-tour-id='reader-toolbar']",
      },
      {
        id: "reader-open-import",
        title: "Open Import Text",
        description:
          "Click Import to open all options: Paste text, File upload, and AI Generate.",
        target: "[data-tour-id='reader-toolbar-import']",
        completed: hasOpenedImportForTour,
        blockedMessage: "Please click the highlighted Import button to continue.",
        autoAdvanceOnComplete: true,
      },
      {
        id: "reader-import-tabs-overview",
        title: "Import Options Overview",
        description:
          "You can Paste text, upload a File (.txt/.pdf), or use Generate. Click Next to continue.",
        target: "[data-tour-id='import-dialog-tabs']",
        placement: "bottom",
        strictTarget: true,
      },
      {
        id: "reader-open-generate-tab",
        title: "Open Generate Tab",
        description: "Click Generate to continue.",
        target: "[data-tour-id='import-dialog-tab-generate']",
        placement: "bottom",
        completed: importTabForTour === "generate",
        blockedMessage: "Please click Generate to continue.",
        autoAdvanceOnComplete: true,
        strictTarget: true,
      },
      {
        id: "reader-import-topic",
        title: "Topic Is Prefilled",
        description:
          "Topic is preset to: how to motivate myself to learn mandarin. Keep it and continue.",
        target: "[data-tour-id='import-dialog-topic']",
        strictTarget: true,
      },
      {
        id: "reader-select-beginner",
        title: "Set Difficulty",
        description: "Click Beginner for the first generated passage.",
        target: "[data-tour-id='import-dialog-level-beginner']",
        completed: hasPickedBeginnerForTour,
        blockedMessage: "Please click Beginner to continue.",
        strictTarget: true,
        autoAdvanceOnComplete: true,
      },
      {
        id: "reader-generate-first-text",
        title: "Generate Your First Text",
        description:
          "Now click Generate Article to create your first passage.",
        target: "[data-tour-id='import-dialog-generate-button']",
        bubbleOffsetY: 42,
        completed: hasGeneratedFromImportForTour,
        blockedMessage: "Please click Generate Article to continue.",
        strictTarget: true,
        autoAdvanceOnComplete: true,
      },
      {
        id: "reader-play-first-sentence",
        title: "Play The First Sentence",
        description: "Click the first sentence play button once to hear the generated passage.",
        target: "[data-tour-id='reader-first-sentence-play']",
        placement: "top",
        bubbleOffsetY: -16,
        completed: hasPlayedFirstSentenceForTour,
        blockedMessage: "Please click play and wait until audio starts.",
        strictTarget: true,
      },
      {
        id: "reader-translation-toggle",
        title: "Turn On Translation",
        description: "Click Show Translation in the toolbar to reveal sentence meaning.",
        target: "[data-tour-id='reader-toolbar']",
      },
      {
        id: "reader-script-toggle",
        title: "Try Script Switch",
        description: "Click Simplified or Traditional once to see script conversion in action.",
        target: "[data-tour-id='reader-toolbar']",
      },
      {
        id: "reader-canvas",
        title: "Reading Area",
        description: "Click any word to open dictionary details, then save vocabulary for later review.",
        target: "[data-tour-id='reader-canvas']",
        placement: "top",
      },
      {
        id: "reader-footer",
        title: "Quality Reminder",
        description: "AI support is helpful but not perfect. Please verify important learning details.",
        target: "[data-tour-id='reader-footer']",
        placement: "top",
      },
    ],
    [
      hasGeneratedFromImportForTour,
      hasOpenedImportForTour,
      hasPickedBeginnerForTour,
      hasPlayedFirstSentenceForTour,
      importTabForTour,
    ],
  );

  useEffect(() => {
    if (!isOnboardingLaunch) return;
    setActiveReaderStepId(null);
    setHasOpenedImportForTour(false);
    setImportClickSignal(0);
    setGenerateTabClickSignal(0);
    setHasPickedBeginnerForTour(false);
    setBeginnerClickSignal(0);
    setHasGeneratedFromImportForTour(false);
    setGenerateActionSignal(0);
    setHasClickedFirstSentenceForTour(false);
    setHasPlayedFirstSentenceForTour(false);
    setImportTabForTour("paste");
    setForcedImportTabForTour("paste");
  }, [isOnboardingLaunch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;
    if (isOnboardingLaunch) return;
    const done = window.localStorage.getItem(onboardingDoneKey) === "done";
    if (done) return;
    router.replace("/dashboard/reader?onboarding=1");
  }, [isOnboardingLaunch, onboardingDoneKey, router, user]);

  const handleReaderStepChange = useCallback(
    (step: WalkthroughStep, _index: number, direction: "start" | "forward" | "back") => {
      if (!isOnboardingLaunch) return;
      setActiveReaderStepId(step.id);

      const importDialogSteps = new Set([
        "reader-import-tabs-overview",
        "reader-open-generate-tab",
        "reader-import-topic",
        "reader-select-beginner",
        "reader-generate-first-text",
      ]);

      // Force UI to expected state for each step.
      if (step.id === "reader-open-import") {
        setImportDialogOpen(false);
        setImportTabForTour("paste");
        setForcedImportTabForTour("paste");
      } else if (importDialogSteps.has(step.id)) {
        setImportDialogOpen(true);
        if (step.id === "reader-open-generate-tab") {
          setForcedImportTabForTour("paste");
          setImportTabForTour("paste");
        } else if (
          step.id === "reader-import-topic" ||
          step.id === "reader-select-beginner" ||
          step.id === "reader-generate-first-text"
        ) {
          setForcedImportTabForTour("generate");
          setImportTabForTour("generate");
        }
      } else {
        setImportDialogOpen(false);
      }

      if (direction !== "back") return;

      if (step.id === "reader-open-import") {
        setHasOpenedImportForTour(false);
        return;
      }

      if (step.id === "reader-open-generate-tab") {
        setForcedImportTabForTour("paste");
        setImportTabForTour("paste");
        return;
      }

      if (step.id === "reader-select-beginner") {
        setForcedImportTabForTour("generate");
        setImportTabForTour("generate");
        setHasPickedBeginnerForTour(false);
        return;
      }

      if (step.id === "reader-generate-first-text") {
        setForcedImportTabForTour("generate");
        setImportTabForTour("generate");
        setHasGeneratedFromImportForTour(false);
        return;
      }

      if (step.id === "reader-play-first-sentence") {
        setHasPlayedFirstSentenceForTour(false);
      }
    },
    [isOnboardingLaunch],
  );

  // Core text state
  const [rawText, setRawText] = useState(initialText ?? "");
  const [displayText, setDisplayText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Jieba segments (flat array for rendering)
  const [jiebaSegments, setJiebaSegments] = useState<WordSegment[] | null>(
    null,
  );
  const [isSegmenting, setIsSegmenting] = useState(false);

  // Batch translations — proper translations per sentence, word glosses for direct mode
  const [batchTranslations, setBatchTranslations] = useState<
    Map<number, string>
  >(new Map());
  const [wordGlossMap, setWordGlossMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [isTranslating, setIsTranslating] = useState(false);
  // Track which sentences+mode we've already translated to avoid refetching
  const translatedKeyRef = useRef<string>("");

  // Full-text TTS
  const { speak, preload, stop, isPlaying, isLoading: ttsLoading, error: ttsError } =
    useTTS();
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [isSentencePlaybackBusy, setIsSentencePlaybackBusy] = useState(false);
  const [playingSentenceIndex, setPlayingSentenceIndex] = useState<
    number | null
  >(null);
  const playAllAbortRef = useRef(false);
  const sentencePlayRunRef = useRef(0);

  // Container ref for selection-based play
  const readerContainerRef = useRef<HTMLDivElement>(null);

  // Per-sentence translation cache (for SentenceControls inline translate)
  const [translationCache, setTranslationCache] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    if (!isOnboardingLaunch || !activeReaderStepId) return;
    const importDialogSteps = new Set([
      "reader-import-tabs-overview",
      "reader-open-generate-tab",
      "reader-import-topic",
      "reader-select-beginner",
      "reader-generate-first-text",
    ]);
    if (!importDialogSteps.has(activeReaderStepId)) return;
    if (!importDialogOpen) {
      setImportDialogOpen(true);
    }
  }, [activeReaderStepId, importDialogOpen, isOnboardingLaunch]);

  // Character popup
  const {
    activeWord,
    isVisible: popupVisible,
    lookupData,
    characterData,
    characterFallbacks,
    isLoading: popupLoading,
    error: popupError,
    virtualEl,
    showPopup,
    hidePopup,
    cancelHide,
    isSaved,
    getSavedId,
    toggleSave,
    ensureSaved,
  } = useCharacterPopup();

  function detectChineseFlavor(text: string): "cantonese" | "mandarin" | "unknown" {
    const sample = text.replace(/\s+/g, "");
    if (!sample) return "unknown";
    const strongCantoneseMarkers = [
      "係", "唔", "冇", "嘅", "啲", "佢", "喺", "咩", "咗", "嗰", "嚟", "乜", "噉", "喎", "㗎",
    ];
    for (const marker of strongCantoneseMarkers) {
      if (sample.includes(marker)) return "cantonese";
    }

    const cantoneseMarkers = [
      "係", "唔", "冇", "嘅", "佢", "啲", "咗", "喺", "嘢", "嗰", "咩", "咁", "乜",
      "嚟", "噉", "啦", "喎", "啱", "掂", "呢", "㗎", "噃", "唔係", "冇有",
      "係咪", "點樣", "邊個", "邊度", "乜嘢", "咁樣", "有冇", "唔使", "唔好",
    ];
    const mandarinMarkers = [
      "是", "的", "不", "没", "你", "我们", "他们", "这", "那", "在", "了", "吗",
      "和", "会", "要", "就", "说", "对", "也", "都", "很", "还",
      "什么", "怎么", "为什么", "因为", "所以", "如果", "但是",
    ];
    let cantoneseScore = 0;
    let mandarinScore = 0;
    for (const marker of cantoneseMarkers) {
      if (sample.includes(marker)) cantoneseScore += 1;
    }
    for (const marker of mandarinMarkers) {
      if (sample.includes(marker)) mandarinScore += 1;
    }
    if (cantoneseScore >= 1 && cantoneseScore > mandarinScore) return "cantonese";
    if (mandarinScore >= 1 && mandarinScore > cantoneseScore) return "mandarin";
    return "unknown";
  }

  const handleImport = useCallback(
    (text: string) => {
      const detected = detectChineseFlavor(text);
      const wantsMandarin = ttsLanguage === "zh-CN";
      const wantsCantonese = ttsLanguage === "zh-HK";
      const mismatch =
        (detected === "cantonese" && wantsMandarin) ||
        (detected === "mandarin" && wantsCantonese);

      if (mismatch) {
        const message =
          detected === "cantonese"
            ? "This looks like Cantonese text. Are you sure you want to read it in Mandarin?"
            : "This looks like Mandarin text. Are you sure you want to read it in Cantonese?";
        const proceed = window.confirm(message);
        if (!proceed) return;
      }

      setRawText(text);
      setImportDialogOpen(false);
      trackAction("import_text", { detectedFlavor: detected });
    },
    [trackAction, ttsLanguage]
  );

  const handleWordClick = useCallback(
    (word: string, _index: number, element: HTMLElement) => {
      console.log("[ReaderClient] Word clicked:", `"${word}"`);
      const cleanWord = word.trim();
      if (cleanWord) {
        showPopup(cleanWord, element);
      }
    },
    [showPopup],
  );

  const handleSpeakSentence = useCallback(
    (text: string, rate: "slow" | "medium" | "fast") => {
      if (isPlayingAll) return;
      sentencePlayRunRef.current += 1;
      const runId = sentencePlayRunRef.current;
      setIsSentencePlaybackBusy(true);
      setSpeakingText(text);
      speak(text, { language: ttsLanguage, rate }).finally(() => {
        setSpeakingText(null);
        if (sentencePlayRunRef.current === runId) {
          setIsSentencePlaybackBusy(false);
        }
      });
    },
    [isPlayingAll, speak, ttsLanguage],
  );

  const handleTranslationFetched = useCallback(
    (text: string, translation: string) => {
      setTranslationCache((prev) => {
        const next = new Map(prev);
        next.set(text, translation);
        return next;
      });
    },
    [],
  );

  // Script conversion
  useEffect(() => {
    if (!rawText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayText("");
      return;
    }

    if (scriptMode === "original") {
      setDisplayText(rawText);
      return;
    }

    let cancelled = false;
    setIsConverting(true);

    convertScript(rawText, "original", scriptMode)
      .then((converted) => {
        if (!cancelled) setDisplayText(converted);
      })
      .catch((err) => {
        console.error("T/S conversion failed:", err);
        if (!cancelled) setDisplayText(rawText);
      })
      .finally(() => {
        if (!cancelled) setIsConverting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rawText, scriptMode]);

  // Client-side fallback segments
  const fallbackSegments: WordSegment[] = useMemo(
    () => segmentText(displayText),
    [displayText],
  );

  // Jieba segmentation
  useEffect(() => {
    if (!displayText) {
      setJiebaSegments(null);
      return;
    }

    // Clear stale segments immediately so fallback (Intl.Segmenter) is used
    // while the async jieba fetch is in flight
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Sentence ranges derived from final segments
  const sentences = useMemo(() => detectSentences(segments), [segments]);
  const firstSentenceText = sentences[0]?.text ?? null;

  useEffect(() => {
    if (!firstSentenceText) return;
    void preload(firstSentenceText, { language: ttsLanguage, rate: "medium" });
  }, [firstSentenceText, preload, ttsLanguage]);

  useEffect(() => {
    if (!isOnboardingLaunch) return;
    if (!hasClickedFirstSentenceForTour) return;
    if (!firstSentenceText) return;
    if (isPlaying && speakingText === firstSentenceText) {
      setHasPlayedFirstSentenceForTour(true);
    }
  }, [
    firstSentenceText,
    hasClickedFirstSentenceForTour,
    isOnboardingLaunch,
    isPlaying,
    speakingText,
  ]);

  // Stable sentence key for translation dedup
  const sentenceKey = useMemo(
    () => JSON.stringify(sentences.map((s) => s.text)),
    [sentences],
  );

  // Stable segments key to track when words change for direct mode
  const segmentsKey = useMemo(
    () =>
      segments
        .filter((s) => s.isWordLike)
        .map((s) => s.text)
        .join("|"),
    [segments],
  );

  // Batch translate when English is toggled on or translationMode changes.
  // IMPORTANT: depend on sentenceKey (stable text identity) NOT sentences (unstable
  // reference). When jieba segments arrive the sentences reference changes but the
  // text stays the same — that would cancel in-flight API calls while the dedup check
  // prevents new ones, leaving translations stuck on "Translating..." forever.
  useEffect(() => {
    if (!showEnglish || !sentenceKey) return;

    // Build a dedup key: mode + sentence texts + segments (for word glosses)
    const key = `${translationMode}:${sentenceKey}:${segmentsKey}`;
    if (key === translatedKeyRef.current) return;
    translatedKeyRef.current = key;

    let cancelled = false;
    setIsTranslating(true);

    // Clear previous translations
    setBatchTranslations(new Map());
    setWordGlossMap(new Map());

    const sentenceTexts = JSON.parse(sentenceKey) as string[];

    (async () => {
      try {
        const translatedMap = new Map<number, string>();
        // 1. Fetch proper translations in chunks of 10
        const sentenceChunks: string[][] = [];
        for (let i = 0; i < sentenceTexts.length; i += 10) {
          sentenceChunks.push(sentenceTexts.slice(i, i + 10));
        }

        let baseIdx = 0;
        for (const chunk of sentenceChunks) {
          if (cancelled) return;
          const translations = await fetchProperTranslations(chunk, ttsLanguage);
          if (!cancelled && translations && translations.length > 0) {
            translations.forEach((t, i) => {
              const mappedIndex = baseIdx + i;
              if (typeof t === "string" && t.trim().length > 0) {
                translatedMap.set(mappedIndex, t);
              }
            });
          }
          baseIdx += chunk.length;
        }

        // Strict fallback pass: fill every missing sentence translation.
        // This is intentionally exhaustive (slower) for complete output quality.
        const missingIndexes: number[] = [];
        for (let i = 0; i < sentenceTexts.length; i++) {
          const source = normalizeSentenceForTranslation(sentenceTexts[i]);
          if (!source) continue;
          const value = translatedMap.get(i);
          if (!value || !value.trim()) {
            missingIndexes.push(i);
          }
        }

        for (const index of missingIndexes) {
          if (cancelled) return;
          const fallback = await fetchSingleTranslation(sentenceTexts[index], ttsLanguage);
          if (!fallback || cancelled) continue;
          translatedMap.set(index, fallback);
        }

        if (!cancelled) {
          setBatchTranslations(new Map(translatedMap));
        }

        // 2. If direct mode, fetch word glosses for unique Chinese words
        if (translationMode === "direct" && !cancelled) {
          const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
          const uniqueWords = [
            ...new Set(
              segments
                .filter((s) => s.isWordLike && CJK.test(s.text))
                .map((s) => s.text),
            ),
          ];

          if (uniqueWords.length > 0) {
            // Chunk words into batches of 100
            const wordChunks: string[][] = [];
            for (let i = 0; i < uniqueWords.length; i += 100) {
              wordChunks.push(uniqueWords.slice(i, i + 100));
            }

            for (const wordChunk of wordChunks) {
              if (cancelled) return;
              const glosses = await fetchWordGlosses(wordChunk, ttsLanguage);
              if (!cancelled && glosses) {
                setWordGlossMap((prev) => {
                  const next = new Map(prev);
                  for (const [word, def] of Object.entries(glosses)) {
                    next.set(word, def);
                  }
                  return next;
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Batch translation loop error:", err);
      } finally {
        if (!cancelled) {
          setIsTranslating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEnglish, translationMode, sentenceKey, segmentsKey]);

  // Full-text TTS: play all sentences or selection
  const handlePlayAll = useCallback(async () => {
    if (sentences.length === 0) return;
    if (isSentencePlaybackBusy) return;

    // No selection — play all sentences
    playAllAbortRef.current = false;
    setIsPlayingAll(true);

    for (let i = 0; i < sentences.length; i++) {
      if (playAllAbortRef.current) break;
      const text = sentences[i].text;
      setPlayingSentenceIndex(i);
      setSpeakingText(text);

      try {
        await speak(text, { language: ttsLanguage });
      } catch {
        // Continue to next sentence on error
      }

      setSpeakingText(null);

      if (!playAllAbortRef.current && i < sentences.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setIsPlayingAll(false);
    setPlayingSentenceIndex(null);
    setSpeakingText(null);
  }, [isSentencePlaybackBusy, sentences, speak, ttsLanguage]);

  const handleStopAll = useCallback(() => {
    playAllAbortRef.current = true;
    stop();
    setIsPlayingAll(false);
    setIsSentencePlaybackBusy(false);
    sentencePlayRunRef.current += 1;
    setPlayingSentenceIndex(null);
    setSpeakingText(null);
  }, [stop]);

  return (
    <div className="container mx-auto px-4 py-6 flex flex-col min-h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between gap-3" data-tour-id="reader-title">
        <h1 className="text-2xl font-bold text-foreground">AI Passage Reader</h1>
      </div>

      <div className="mt-3" data-tour-id="reader-toolbar">
        <ReaderToolbar
          showPinyin={showPinyin}
          showJyutping={showJyutping}
          showEnglish={showEnglish}
          translationMode={translationMode}
          scriptMode={scriptMode}
          fontSize={fontSize}
          ttsLanguage={ttsLanguage}
          onShowPinyinChange={setShowPinyin}
          onShowJyutpingChange={setShowJyutping}
          onShowEnglishChange={setShowEnglish}
          onTranslationModeChange={(mode) => {
            // Clear the translated key so the effect re-fires
            translatedKeyRef.current = "";
            setTranslationMode(mode);
          }}
          onScriptModeChange={setScriptMode}
          onFontSizeChange={setFontSize}
          onTtsLanguageChange={setTtsLanguage}
          onImportClick={() => {
            setImportDialogOpen(true);
            setHasOpenedImportForTour(true);
            setImportClickSignal((prev) => prev + 1);
            trackAction("open_import_dialog");
          }}
          importButtonTourId="reader-toolbar-import"
          onPlayAll={handlePlayAll}
          onStopAll={handleStopAll}
          isPlayingAll={isPlayingAll}
          isLoadingTts={ttsLoading}
          disablePlayAll={isSentencePlaybackBusy}
        />
      </div>

      {(isConverting || isSegmenting) && (
        <div className="text-sm text-muted-foreground">
          {isConverting ? "Converting..." : "Segmenting..."}
        </div>
      )}

      <div className="mt-2" data-tour-id="reader-canvas">
        <ReaderTextArea
          segments={segments}
          showPinyin={showPinyin}
          showJyutping={showJyutping}
          showEnglish={showEnglish}
          translationMode={translationMode}
          fontSize={fontSize}
          onWordClick={handleWordClick}
          language={ttsLanguage}
          onSpeakSentence={handleSpeakSentence}
          onSentencePlay={(index) => {
            if (index === 0) {
              setHasClickedFirstSentenceForTour(true);
              trackAction("play_first_sentence");
            }
          }}
          firstSentencePlayTourId="reader-first-sentence-play"
          disableSentencePlayback={isPlayingAll}
          isSpeaking={isPlaying || ttsLoading}
          speakingText={speakingText}
          ttsError={ttsError}
          translationCache={translationCache}
          onTranslationFetched={handleTranslationFetched}
          batchTranslations={batchTranslations}
          wordGlossMap={wordGlossMap}
          isTranslating={isTranslating}
          playingSentenceIndex={playingSentenceIndex}
          containerRef={readerContainerRef}
        />
      </div>

      <CharacterPopup
        isVisible={popupVisible}
        virtualEl={virtualEl}
        activeWord={activeWord}
        lookupData={lookupData}
        characterData={characterData}
        characterFallbacks={characterFallbacks}
        isLoading={popupLoading}
        error={popupError}
        isSaved={
          activeWord
            ? isSaved(lookupData?.entries[0]?.traditional ?? activeWord)
            : false
        }
        savedItemId={
          activeWord && lookupData?.entries[0]
            ? getSavedId(lookupData.entries[0].traditional) ?? null
            : null
        }
        onEnsureSaved={async () => {
          const entry = lookupData?.entries[0];
          return entry ? ensureSaved(entry) : null;
        }}
        onToggleSave={() => {
          const entry = lookupData?.entries[0];
          if (entry) toggleSave(entry);
        }}
        onHide={hidePopup}
        onCancelHide={cancelHide}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        prefillTopic={
          isOnboardingLaunch
            ? "how to motivate myself to learn mandarin"
            : undefined
        }
        onLevelChange={(value) => {
          if (value === "1") {
            setHasPickedBeginnerForTour(true);
            setBeginnerClickSignal((prev) => prev + 1);
          }
        }}
        onSourceImported={(source) => {
          if (source === "generate") {
            setHasGeneratedFromImportForTour(true);
            setGenerateActionSignal((prev) => prev + 1);
            trackAction("generate_passage");
          }
        }}
        onTabChange={(tab) => {
          setForcedImportTabForTour(tab);
          setImportTabForTour(tab);
          if (tab === "generate") {
            setGenerateTabClickSignal((prev) => prev + 1);
          }
        }}
        lockDuringOnboarding={isOnboardingLaunch}
        forcedActiveTab={isOnboardingLaunch ? forcedImportTabForTour : undefined}
        storageScopeKey={user?.id}
      />

      <div className="pt-6 mt-auto border-t border-border text-xs text-muted-foreground" data-tour-id="reader-footer">
        This is an AI-assisted product. We do not guarantee accuracy or
        completeness. Please verify important information independently.
      </div>

      <ProductWalkthrough
        steps={walkthroughSteps}
        storageKey={onboardingDoneKey}
        enabled={canRunWalkthrough}
        autoStart={isOnboardingLaunch}
        runToken={isOnboardingLaunch ? 1 : 0}
        markDoneOnFinish={false}
        stepOffset={0}
        totalSteps={17}
        actionSignals={{
          "reader-open-import": importClickSignal,
          "reader-open-generate-tab": generateTabClickSignal,
          "reader-select-beginner": beginnerClickSignal,
          "reader-generate-first-text": generateActionSignal,
        }}
        onStepChange={handleReaderStepChange}
        onFinish={() => {
          router.push("/dashboard/listening?onboarding=1&stage=listening");
        }}
      />
    </div>
  );
}
