import { smartRomanise } from "@/lib/romanise";

const STORAGE_KEY = "reader-annotation-cache-v1";
const MAX_ENTRIES = 8;

export type ReaderAnnotationLanguage = "zh-CN" | "zh-HK";

export type ReaderAnnotationCacheEntry = {
  sourceText: string;
  language: ReaderAnnotationLanguage;
  romanization?: string;
  properTranslations?: string[];
  wordGlosses?: Record<string, string>;
  sentenceTranslations?: Record<string, string>;
  updatedAt: number;
};

type ReaderAnnotationCache = Record<string, ReaderAnnotationCacheEntry>;

function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}

function entryKey(text: string, language: ReaderAnnotationLanguage): string {
  return `${language}:${fingerprint(text)}`;
}

function loadCache(): ReaderAnnotationCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReaderAnnotationCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function storeCache(cache: ReaderAnnotationCache): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = Object.fromEntries(
      Object.entries(cache)
        .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_ENTRIES),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage can be disabled or full. Annotation generation still works.
  }
}

export function readReaderAnnotationCache(
  sourceText: string,
  language: ReaderAnnotationLanguage,
): ReaderAnnotationCacheEntry | null {
  const entry = loadCache()[entryKey(sourceText, language)];
  if (!entry || entry.sourceText !== sourceText || entry.language !== language) {
    return null;
  }
  return entry;
}

export function updateReaderAnnotationCache(
  sourceText: string,
  language: ReaderAnnotationLanguage,
  updates: Partial<Omit<ReaderAnnotationCacheEntry, "sourceText" | "language" | "updatedAt">>,
): ReaderAnnotationCacheEntry {
  const cache = loadCache();
  const key = entryKey(sourceText, language);
  const existing = cache[key];
  const entry: ReaderAnnotationCacheEntry = {
    ...(existing?.sourceText === sourceText ? existing : {}),
    ...updates,
    sourceText,
    language,
    updatedAt: Date.now(),
  };
  cache[key] = entry;
  storeCache(cache);
  return entry;
}

export function getOrCreateReaderRomanization(
  sourceText: string,
  language: ReaderAnnotationLanguage,
): string {
  if (!sourceText.trim()) return "";
  const cached = readReaderAnnotationCache(sourceText, language)?.romanization?.trim();
  if (cached) return cached;
  const romanization = smartRomanise(
    sourceText,
    language === "zh-HK" ? "cantonese" : "mandarin",
  );
  if (romanization) {
    updateReaderAnnotationCache(sourceText, language, { romanization });
  }
  return romanization;
}
