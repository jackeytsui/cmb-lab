"use client";

import { useEffect, useState } from "react";
import {
  annotateFromWords,
  annotateSentence,
  type CharAnnotation,
  type WordToken,
} from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// Resolve per-character Mandarin annotations for a sentence using the same
// jieba segmentation pipeline as the 1:1 coaching page (POST /api/segment),
// which gives far more accurate polyphonic pinyin than Intl.Segmenter.
//
// The Intl-based `annotateSentence` renders immediately (no empty flash),
// then the jieba-backed result replaces it once the request returns. Results
// are cached per sentence (module-level) and de-duplicated in flight, so the
// same sentence rendered in multiple places (submission card, reviewer view,
// feedback page) segments once.
// ---------------------------------------------------------------------------

const cache = new Map<string, CharAnnotation[]>();
const inflight = new Map<string, Promise<CharAnnotation[]>>();

async function fetchJiebaAnnotations(
  text: string,
): Promise<CharAnnotation[]> {
  const res = await fetch("/api/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!res.ok) throw new Error(`segment failed: ${res.status}`);
  const data = await res.json();
  const words = (data.segments?.[0] ?? []) as WordToken[];
  if (!Array.isArray(words) || words.length === 0) {
    return annotateSentence(text);
  }
  return annotateFromWords(words);
}

export function useSentenceAnnotations(text: string): CharAnnotation[] {
  // Only the async jieba result is held in state; cache hits and the Intl
  // fallback are derived during render, so the effect's only setState is in
  // the async callback (never synchronous).
  const [resolved, setResolved] = useState<{
    text: string;
    annotations: CharAnnotation[];
  } | null>(null);

  useEffect(() => {
    if (cache.has(text)) return; // render already uses the cached value

    let cancelled = false;
    let request = inflight.get(text);
    if (!request) {
      request = fetchJiebaAnnotations(text)
        .then((result) => {
          cache.set(text, result);
          inflight.delete(text);
          return result;
        })
        .catch(() => {
          inflight.delete(text);
          return annotateSentence(text);
        });
      inflight.set(text, request);
    }
    request.then((result) => {
      if (!cancelled) setResolved({ text, annotations: result });
    });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (resolved && resolved.text === text) return resolved.annotations;
  // Synchronous Intl fallback until the jieba result for THIS text arrives.
  return cache.get(text) ?? annotateSentence(text);
}
