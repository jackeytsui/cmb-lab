"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";

// --- Types ---

export interface DictionaryEntry {
  id: string;
  traditional: string;
  simplified: string;
  pinyin: string;
  pinyinDisplay: string;
  jyutping: string | null;
  definitions: string[];
  source: "cedict" | "canto" | "both";
  isSingleChar: boolean;
}

export interface LookupData {
  entries: DictionaryEntry[];
}

export interface CharacterDetail {
  character: string;
  pinyin: string[];
  jyutping: string[];
  radical: string;
  radicalMeaning: string | null;
  strokeCount: number;
  decomposition: string;
  etymologyType: string | null;
  etymologyHint: string | null;
  etymologyPhonetic: string | null;
  etymologySemantic: string | null;
  definition: string | null;
  frequencyRank: number | null;
  strokePaths: unknown;
  strokeMedians: unknown;
}

export interface CharacterDetailData {
  character: CharacterDetail | null;
  examples: Array<{
    traditional: string;
    simplified: string;
    pinyin: string;
    pinyinDisplay: string;
    definitions: string[];
    source: string;
  }>;
}

export type VirtualElement = {
  getBoundingClientRect: () => DOMRect;
};

/** Per-character fallback entry when compound word has no dictionary match */
export interface CharacterFallback {
  character: string;
  entries: DictionaryEntry[];
}

export interface UseCharacterPopupReturn {
  activeWord: string | null;
  isVisible: boolean;
  lookupData: LookupData | null;
  characterData: CharacterDetailData | null;
  characterFallbacks: CharacterFallback[] | null;
  isLoading: boolean;
  error: string | null;
  virtualEl: VirtualElement | null;
  showPopup: (word: string, element: HTMLElement) => void;
  hidePopup: () => void;
  cancelHide: () => void;
  isSaved: (traditional: string) => boolean;
  getSavedId: (traditional: string) => string | undefined;
  toggleSave: (entry: DictionaryEntry) => Promise<void>;
  ensureSaved: (entry: DictionaryEntry) => Promise<string | null>;
  savedVocabMap: Map<string, string>;
}

// --- Hook ---

/**
 * Central state management hook for the character popup dictionary.
 *
 * Manages:
 * - Active word and popup visibility with delayed hide (200ms)
 * - Dictionary data fetching with 150ms debounce and AbortController
 * - Character detail fetching for single characters
 * - Floating UI virtual element for popup positioning
 * - Saved vocabulary tracking with optimistic toggle
 *
 * @example
 * ```tsx
 * const popup = useCharacterPopup();
 *
 * // On word hover/tap
 * popup.showPopup("你好", spanElement);
 *
 * // On mouse leave
 * popup.hidePopup();
 *
 * // On popup mouse enter (prevent hide)
 * popup.cancelHide();
 *
 * // Check if a word is bookmarked
 * popup.isSaved("你好"); // boolean
 *
 * // Toggle bookmark
 * await popup.toggleSave(entry);
 * ```
 */
export function useCharacterPopup(): UseCharacterPopupReturn {
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [lookupData, setLookupData] = useState<LookupData | null>(null);
  const [characterData, setCharacterData] =
    useState<CharacterDetailData | null>(null);
  const [characterFallbacks, setCharacterFallbacks] =
    useState<CharacterFallback[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVocabMap, setSavedVocabMap] = useState<Map<string, string>>(
    () => new Map()
  );
  const [virtualEl, setVirtualEl] = useState<VirtualElement | null>(null);

  // Refs
  const mountedRef = useRef(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Load saved vocabulary on mount ---

  useEffect(() => {
    let cancelled = false;

    async function loadSaved() {
      try {
        const res = await fetch("/api/vocabulary");
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: Array<{ id: string; traditional: string; simplified: string }>;
        };
        if (!cancelled && mountedRef.current) {
          const map = new Map<string, string>();
          for (const item of data.items) {
            map.set(item.traditional, item.id);
            map.set(item.simplified, item.id);
          }
          setSavedVocabMap(map);
        }
      } catch {
        // Silent failure — vocabulary state is non-critical
      }
    }

    loadSaved();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Cleanup on unmount ---

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // --- Dictionary fetch (debounced) ---

  const fetchDictionaryData = useDebouncedCallback(
    async (word: string) => {
      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setLookupData(null);
      setCharacterData(null);
      setCharacterFallbacks(null);

      try {
        const chars = [...word];
        const isSingleChar = chars.length === 1;

        // Set a 10s timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          console.warn("[CharacterPopup] Fetch timed out for:", word);
          controller.abort("Timeout");
        }, 10000);

        const lookupPromise = fetch(
          `/api/dictionary/lookup?word=${encodeURIComponent(word)}`,
          { signal: controller.signal }
        );

        const characterPromise = isSingleChar
          ? fetch(
              `/api/dictionary/character?char=${encodeURIComponent(word)}`,
              { signal: controller.signal }
            )
          : null;

        // Execute in parallel when applicable
        const results = await Promise.all(
          [lookupPromise, characterPromise].filter(Boolean) as Promise<Response>[]
        );

        clearTimeout(timeoutId);

        const lookupRes = results[0];
        const characterRes = isSingleChar ? results[1] : null;

        if (!lookupRes.ok) {
          throw new Error(`Dictionary lookup failed: ${lookupRes.status}`);
        }

        const lookupJson = (await lookupRes.json()) as LookupData;
        console.log("[CharacterPopup] Lookup success:", word, lookupJson.entries.length, "entries");
        
        let charJson: CharacterDetailData | null = null;

        if (characterRes && characterRes.ok) {
          charJson = (await characterRes.json()) as CharacterDetailData;
        }

        // PLECO-style fallback: if compound word has no entries,
        // look up each individual character
        let fallbacks: CharacterFallback[] | null = null;
        if (
          lookupJson.entries.length === 0 &&
          !isSingleChar &&
          chars.length <= 8
        ) {
          const charResults = await Promise.all(
            chars.map(async (char) => {
              // Skip non-CJK characters (punctuation, spaces)
              if (!/[\p{Script=Han}]/u.test(char)) {
                return { character: char, entries: [] as DictionaryEntry[] };
              }
              try {
                const res = await fetch(
                  `/api/dictionary/lookup?word=${encodeURIComponent(char)}`,
                  { signal: controller.signal }
                );
                if (!res.ok) return { character: char, entries: [] as DictionaryEntry[] };
                const data = (await res.json()) as LookupData;
                return { character: char, entries: data.entries };
              } catch {
                return { character: char, entries: [] as DictionaryEntry[] };
              }
            })
          );
          // Only set fallbacks if at least one character has entries
          if (charResults.some((r) => r.entries.length > 0)) {
            fallbacks = charResults;
          }
        }

        // Stale check — only update if this word is still active
        if (mountedRef.current && !controller.signal.aborted) {
          setLookupData(lookupJson);
          setCharacterData(charJson);
          setCharacterFallbacks(fallbacks);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // If aborted due to timeout, show error
          if (controller.signal.reason === "Timeout") {
            if (mountedRef.current) {
              setError("Request timed out. Please try again.");
              setIsLoading(false);
            }
          }
          // Otherwise aborted due to new request (user moved mouse), ignore
          return;
        }
        console.error("[CharacterPopup] Fetch error:", err);
        if (mountedRef.current) {
          setError("Failed to load dictionary data");
          setIsLoading(false);
        }
      }
    },
    150
  );

  // --- Show/Hide ---

  const showPopup = useCallback(
    (word: string, element: HTMLElement) => {
      // Cancel any pending hide
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      setActiveWord(word);
      setVirtualEl({
        getBoundingClientRect: () => element.getBoundingClientRect(),
      });
      setIsVisible(true);
      
      // Reset state immediately to show loading skeleton
      setLookupData(null);
      setCharacterData(null);
      setCharacterFallbacks(null);
      setIsLoading(true);
      setError(null);

      // Trigger debounced dictionary fetch
      fetchDictionaryData(word);
    },
    [fetchDictionaryData]
  );

  const hidePopup = useCallback(() => {
    // Delay hide by 200ms to allow cursor to move to popup
    hideTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setIsVisible(false);
        setActiveWord(null);
        setLookupData(null);
        setCharacterData(null);
        setCharacterFallbacks(null);
        setError(null);
      }
      hideTimeoutRef.current = null;
    }, 200);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // --- Vocabulary save/unsave ---

  const isSaved = useCallback(
    (traditional: string): boolean => {
      return savedVocabMap.has(traditional);
    },
    [savedVocabMap]
  );

  const getSavedId = useCallback(
    (traditional: string): string | undefined => {
      return savedVocabMap.get(traditional);
    },
    [savedVocabMap]
  );

  const ensureSaved = useCallback(
    async (entry: DictionaryEntry): Promise<string | null> => {
      const existingId = savedVocabMap.get(entry.traditional);
      if (existingId && !existingId.startsWith("pending-")) {
        return existingId;
      }

      // If pending, wait? Or just return pending ID?
      // Pending ID won't work for API calls that expect UUID.
      // So we should probably wait for real ID if it's pending.
      // But for simplicity, let's trigger a save if not present.

      if (existingId && existingId.startsWith("pending-")) {
        // Already saving... 
        // Ideally we should wait for the promise.
        // But our optimistic logic doesn't store the promise.
        // Let's just return null or throw.
        return null;
      }

      // Optimistic save
      const placeholderId = `pending-${Date.now()}`;
      setSavedVocabMap((prev) => {
        const next = new Map(prev);
        next.set(entry.traditional, placeholderId);
        next.set(entry.simplified, placeholderId);
        return next;
      });

      try {
        const res = await fetch("/api/vocabulary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traditional: entry.traditional,
            simplified: entry.simplified,
            pinyin: entry.pinyin || undefined,
            jyutping: entry.jyutping || undefined,
            definitions: entry.definitions,
          }),
        });

        if (!res.ok) throw new Error("Save failed");

        const data = (await res.json()) as { id: string; alreadySaved: boolean };

        // Replace placeholder
        if (mountedRef.current) {
          setSavedVocabMap((prev) => {
            const next = new Map(prev);
            next.set(entry.traditional, data.id);
            next.set(entry.simplified, data.id);
            return next;
          });
        }
        return data.id;
      } catch {
        // Rollback
        if (mountedRef.current) {
          setSavedVocabMap((prev) => {
            const next = new Map(prev);
            next.delete(entry.traditional);
            next.delete(entry.simplified);
            return next;
          });
        }
        return null;
      }
    },
    [savedVocabMap]
  );

  const toggleSave = useCallback(
    async (entry: DictionaryEntry): Promise<void> => {
      const existingId = savedVocabMap.get(entry.traditional);

      if (existingId) {
        // Optimistic unsave (remove both traditional and simplified keys)
        setSavedVocabMap((prev) => {
          const next = new Map(prev);
          next.delete(entry.traditional);
          next.delete(entry.simplified);
          return next;
        });

        try {
          const res = await fetch(
            `/api/vocabulary?id=${encodeURIComponent(existingId)}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error("Delete failed");
        } catch {
          // Rollback on error
          if (mountedRef.current) {
            setSavedVocabMap((prev) => {
              const next = new Map(prev);
              next.set(entry.traditional, existingId);
              next.set(entry.simplified, existingId);
              return next;
            });
          }
        }
      } else {
        await ensureSaved(entry);
      }
    },
    [savedVocabMap, ensureSaved]
  );

  return {
    activeWord,
    isVisible,
    lookupData,
    characterData,
    characterFallbacks,
    isLoading,
    error,
    virtualEl,
    showPopup,
    hidePopup,
    cancelHide,
    isSaved,
    getSavedId,
    toggleSave,
    ensureSaved,
    savedVocabMap,
  };
}
