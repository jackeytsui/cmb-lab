"use client";

/**
 * useSubtitlePreference Hook
 *
 * Manages user preferences for subtitle annotations (Pinyin/Jyutping).
 * Persists preferences to localStorage for consistent experience across sessions.
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "subtitle-prefs";

interface SubtitlePreferences {
  showPinyin: boolean;
  showJyutping: boolean;
}

const DEFAULT_PREFERENCES: SubtitlePreferences = {
  showPinyin: true,
  showJyutping: true,
};

/**
 * Hook return type.
 */
export interface UseSubtitlePreferenceReturn {
  /** Whether Pinyin annotations are visible */
  showPinyin: boolean;
  /** Whether Jyutping annotations are visible */
  showJyutping: boolean;
  /** Toggle Pinyin visibility */
  togglePinyin: () => void;
  /** Toggle Jyutping visibility */
  toggleJyutping: () => void;
  /** Set Pinyin visibility directly */
  setShowPinyin: (show: boolean) => void;
  /** Set Jyutping visibility directly */
  setShowJyutping: (show: boolean) => void;
}

/**
 * Hook for managing subtitle annotation preferences.
 *
 * @example
 * ```tsx
 * const { showPinyin, showJyutping, togglePinyin, toggleJyutping } = useSubtitlePreference();
 *
 * return (
 *   <>
 *     <SubtitleOverlay showPinyin={showPinyin} showJyutping={showJyutping} />
 *     <button onClick={togglePinyin}>Toggle Pinyin</button>
 *     <button onClick={toggleJyutping}>Toggle Jyutping</button>
 *   </>
 * );
 * ```
 */
export function useSubtitlePreference(): UseSubtitlePreferenceReturn {
  const [preferences, setPreferences] = useState<SubtitlePreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load preferences from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SubtitlePreferences>;
        // Hydration from localStorage -- intentional setState in effect
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferences({
          showPinyin: parsed.showPinyin ?? DEFAULT_PREFERENCES.showPinyin,
          showJyutping: parsed.showJyutping ?? DEFAULT_PREFERENCES.showJyutping,
        });
      }
    } catch {
      // If localStorage read fails, use defaults
      console.warn("Failed to load subtitle preferences from localStorage");
    }
    setIsHydrated(true);
  }, []);

  // Persist preferences to localStorage when they change (after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      console.warn("Failed to save subtitle preferences to localStorage");
    }
  }, [preferences, isHydrated]);

  const togglePinyin = useCallback(() => {
    setPreferences((prev) => ({ ...prev, showPinyin: !prev.showPinyin }));
  }, []);

  const toggleJyutping = useCallback(() => {
    setPreferences((prev) => ({ ...prev, showJyutping: !prev.showJyutping }));
  }, []);

  const setShowPinyin = useCallback((show: boolean) => {
    setPreferences((prev) => ({ ...prev, showPinyin: show }));
  }, []);

  const setShowJyutping = useCallback((show: boolean) => {
    setPreferences((prev) => ({ ...prev, showJyutping: show }));
  }, []);

  return {
    showPinyin: preferences.showPinyin,
    showJyutping: preferences.showJyutping,
    togglePinyin,
    toggleJyutping,
    setShowPinyin,
    setShowJyutping,
  };
}
