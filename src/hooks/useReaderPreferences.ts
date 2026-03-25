"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "reader-prefs";

export interface ReaderPreferences {
  showPinyin: boolean;
  showJyutping: boolean;
  showEnglish: boolean;
  translationMode: "proper" | "direct";
  scriptMode: "original" | "simplified" | "traditional";
  fontSize: number;
  ttsLanguage: "zh-CN" | "zh-HK";
  toneColorsEnabled: boolean;
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  showPinyin: true,
  showJyutping: true,
  showEnglish: true,
  translationMode: "proper",
  scriptMode: "original",
  fontSize: 18,
  ttsLanguage: "zh-CN",
  toneColorsEnabled: false,
};

export interface UseReaderPreferencesReturn extends ReaderPreferences {
  setShowPinyin: (v: boolean) => void;
  setShowJyutping: (v: boolean) => void;
  setShowEnglish: (v: boolean) => void;
  setTranslationMode: (mode: "proper" | "direct") => void;
  setScriptMode: (mode: ReaderPreferences["scriptMode"]) => void;
  setFontSize: (size: number) => void;
  setTtsLanguage: (lang: "zh-CN" | "zh-HK") => void;
  setToneColorsEnabled: (v: boolean) => void;
}

function getStorageKey(scopeKey?: string) {
  return scopeKey ? `${STORAGE_KEY}.${scopeKey}` : STORAGE_KEY;
}

export function useReaderPreferences(scopeKey?: string): UseReaderPreferencesReturn {
  const [preferences, setPreferences] =
    useState<ReaderPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);
  const storageKey = getStorageKey(scopeKey);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;

        // Migration: old format had annotationMode string
        if ("annotationMode" in parsed && !("showPinyin" in parsed)) {
          const oldMode = parsed.annotationMode as string;
          parsed.showPinyin = oldMode === "pinyin";
          parsed.showJyutping = oldMode === "jyutping";
          parsed.showEnglish = false;
          delete parsed.annotationMode;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferences({
          showPinyin: typeof parsed.showPinyin === "boolean" ? parsed.showPinyin : DEFAULT_PREFERENCES.showPinyin,
          showJyutping: typeof parsed.showJyutping === "boolean" ? parsed.showJyutping : DEFAULT_PREFERENCES.showJyutping,
          showEnglish: typeof parsed.showEnglish === "boolean" ? parsed.showEnglish : DEFAULT_PREFERENCES.showEnglish,
          translationMode: parsed.translationMode === "direct" ? "direct" : "proper",
          scriptMode: (parsed.scriptMode as string) === "simplified" || (parsed.scriptMode as string) === "traditional"
            ? (parsed.scriptMode as ReaderPreferences["scriptMode"])
            : DEFAULT_PREFERENCES.scriptMode,
          fontSize: typeof parsed.fontSize === "number" ? parsed.fontSize : DEFAULT_PREFERENCES.fontSize,
          ttsLanguage: parsed.ttsLanguage === "zh-HK" ? "zh-HK" : "zh-CN",
          toneColorsEnabled: typeof parsed.toneColorsEnabled === "boolean" ? parsed.toneColorsEnabled : DEFAULT_PREFERENCES.toneColorsEnabled,
        });
      }
    } catch {
      console.warn("Failed to load reader preferences from localStorage");
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      console.warn("Failed to save reader preferences to localStorage");
    }
  }, [preferences, isHydrated, storageKey]);

  const setShowPinyin = useCallback((v: boolean) => {
    setPreferences((prev) => ({ ...prev, showPinyin: v }));
  }, []);

  const setShowJyutping = useCallback((v: boolean) => {
    setPreferences((prev) => ({ ...prev, showJyutping: v }));
  }, []);

  const setShowEnglish = useCallback((v: boolean) => {
    setPreferences((prev) => ({ ...prev, showEnglish: v }));
  }, []);

  const setTranslationMode = useCallback((mode: "proper" | "direct") => {
    setPreferences((prev) => ({ ...prev, translationMode: mode }));
  }, []);

  const setScriptMode = useCallback(
    (mode: ReaderPreferences["scriptMode"]) => {
      setPreferences((prev) => ({ ...prev, scriptMode: mode }));
    },
    [],
  );

  const setFontSize = useCallback((size: number) => {
    setPreferences((prev) => ({
      ...prev,
      fontSize: Math.max(14, Math.min(40, size)),
    }));
  }, []);

  const setTtsLanguage = useCallback((lang: "zh-CN" | "zh-HK") => {
    setPreferences((prev) => ({ ...prev, ttsLanguage: lang }));
  }, []);

  const setToneColorsEnabled = useCallback((v: boolean) => {
    setPreferences((prev) => ({ ...prev, toneColorsEnabled: v }));
  }, []);

  return {
    ...preferences,
    setShowPinyin,
    setShowJyutping,
    setShowEnglish,
    setTranslationMode,
    setScriptMode,
    setFontSize,
    setTtsLanguage,
    setToneColorsEnabled,
  };
}
