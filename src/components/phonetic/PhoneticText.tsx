"use client";

import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { cn } from "@/lib/utils";

interface PhoneticTextProps {
  children: React.ReactNode;
  className?: string;
  /** Override the auto-detected language to force a specific font */
  forceLanguage?: "cantonese" | "mandarin";
}

/**
 * Wrapper component that applies the correct phonetic annotation font
 * to Chinese text based on the user's language preference.
 *
 * - "mandarin" -> font-hanzi-pinyin (shows pinyin above characters)
 * - "cantonese" -> font-cantonese-visual (shows Cantonese phonetics above characters)
 * - "both" -> defaults to font-hanzi-pinyin (Mandarin pinyin)
 *
 * The fonts themselves handle rendering phonetic annotations above characters
 * automatically -- no ruby HTML is needed.
 *
 * Usage:
 * ```tsx
 * <PhoneticText>你好世界</PhoneticText>
 * <PhoneticText forceLanguage="cantonese">你好世界</PhoneticText>
 * ```
 */
export function PhoneticText({ children, className, forceLanguage }: PhoneticTextProps) {
  const { preference } = useLanguagePreference();
  const lang = forceLanguage || preference;

  const fontClass =
    lang === "cantonese"
      ? "font-cantonese-visual"
      : "font-hanzi-pinyin"; // mandarin and "both" default to pinyin

  return <span className={cn(fontClass, className)}>{children}</span>;
}
