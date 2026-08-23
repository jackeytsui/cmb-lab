"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segmentText, type WordSegment } from "@/lib/segmenter";
import { detectSentences } from "@/lib/sentences";
import { convertScript } from "@/lib/chinese-convert";
import { useTTS } from "@/hooks/useTTS";

export type ScriptMode = "simplified" | "traditional";

/**
 * Fetch jieba-based word segmentations for a batch of sentences.
 * Falls back to client-side segmentation on any failure.
 */
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

/**
 * Hook: given committed Traditional Chinese text, a script mode
 * (simplified|traditional), and a language (zh-CN|zh-HK), produce the
 * segmented + sentence-detected + batch-translated state needed to render
 * the coaching-style output bubbles (ReaderTextArea).
 *
 * Pure client-side — no session/DB dependencies. Safe to reuse anywhere that
 * needs the "paste Chinese, see rendered output with ruby/tone/translation"
 * experience.
 */
export function useProcessedChineseText({
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
  // This records only a completed request. Recording an in-flight request here
  // makes an effect cleanup cancel the request and then causes the replacement
  // effect to deduplicate itself forever.
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
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!committedText) {
        setDisplayText("");
        setIsConverting(false);
        return;
      }

      if (scriptMode === "traditional") {
        setDisplayText(committedText);
        setIsConverting(false);
        return;
      }

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
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!displayText) {
        setJiebaSegments(null);
        setIsSegmenting(false);
        return;
      }

      setJiebaSegments(null);
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
    });

    return () => {
      cancelled = true;
    };
  }, [displayText]);

  const segments = jiebaSegments ?? fallbackSegments;
  const sentences = useMemo(() => detectSentences(segments), [segments]);
  const sentenceKey = useMemo(
    () => JSON.stringify(sentences.map((s) => s.text)),
    [sentences],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const sentenceTexts = JSON.parse(sentenceKey) as string[];
      if (sentenceTexts.length === 0) {
        setBatchTranslations(new Map());
        setTranslationCache(new Map());
        translatedKeyRef.current = "";
        setIsTranslating(false);
        return;
      }

      const translationKey = `${language}:${sentenceKey}`;
      if (translationKey === translatedKeyRef.current) return;
      setIsTranslating(true);

      fetchProperTranslations(sentenceTexts, language)
        .then((translations) => {
          if (cancelled || !translations) return;
          const map = new Map<number, string>();
          translations.forEach((t, idx) => {
            if (t) map.set(idx, t);
          });
          setBatchTranslations(map);

          setTranslationCache((prev) => {
            const next = new Map(prev);
            sentenceTexts.forEach((text, idx) => {
              const t = map.get(idx);
              if (t) next.set(text, t);
            });
            return next;
          });
          translatedKeyRef.current = translationKey;
        })
        .finally(() => {
          if (!cancelled) setIsTranslating(false);
        });
    });

    return () => {
      cancelled = true;
    };
  // Depend on sentenceKey, not the sentences array. Segmentation can replace
  // the array with an equivalent one while a translation is in flight.
  }, [language, sentenceKey]);

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
