"use client";

import { useState } from "react";
import { Loader2, Pencil, Play, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchProperTranslations,
  generateAnnotation,
} from "@/lib/mandarin-generation";
import { generateModelRomanisation } from "@/lib/generate-model-pinyin";
import { AnnotatedSentence } from "@/components/assignments/AnnotatedSentence";
import { ModelAnnotatedSentence } from "@/components/assignments/ModelAnnotatedSentence";
import {
  ASSIGNMENT_CHAR_SIZE,
  ASSIGNMENT_CHAR_SIZE_COMPACT,
} from "@/lib/mandarin-annotate";
import { useTTS } from "@/hooks/useTTS";

// ---------------------------------------------------------------------------
// Simplified Mandarin sentence input for assignments.
//
// Behaves like the 1:1 coaching Mandarin input (type Chinese, press Enter,
// pinyin + English are generated via the exact same pipeline — see
// src/lib/mandarin-generation.ts) but without the coaching-only actions
// (copy over to Cantonese, extra notes, edit pinyin, delete entry).
//
// Used by the student text-assignment lesson page and the reviewer's inline
// correction input.
// ---------------------------------------------------------------------------

export interface MandarinSentenceValue {
  chineseText: string;
  pinyin: string;
  english: string;
}

interface MandarinSentenceInputProps {
  /** Committed (generated) value; null while typing/regenerating. */
  value: MandarinSentenceValue | null;
  onValueChange: (value: MandarinSentenceValue | null) => void;
  /** Reports generation-in-flight so parents can block submission. */
  onGeneratingChange?: (generating: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  editButtonLabel?: string;
  /** Hide the edit button entirely (read-only display). */
  readOnly?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  /** Generation/display/TTS language: mandarin (pinyin) or cantonese (jyutping). */
  lang?: "mandarin" | "cantonese";
  /**
   * Reviewer/admin mode: never block on a failed English translation (commit
   * with whatever was generated and let the reviewer fill it in), and expose
   * editable pinyin + English fields so a wrong auto-generation can be
   * overwritten by hand. Students do not get this — they must retry.
   */
  annotationEditable?: boolean;
}

export function MandarinSentenceInput({
  value,
  onValueChange,
  onGeneratingChange,
  disabled,
  placeholder,
  editButtonLabel = "Edit your submission",
  readOnly = false,
  autoFocus = false,
  compact = false,
  lang = "mandarin",
  annotationEditable = false,
}: MandarinSentenceInputProps) {
  const resolvedPlaceholder =
    placeholder ??
    (lang === "cantonese"
      ? "Type your Cantonese sentence here, then press Enter..."
      : "Type your Mandarin sentence here, then press Enter...");
  const [draft, setDraft] = useState(value?.chineseText ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { speak, stop, isPlaying, isLoading: ttsLoading } = useTTS();

  const setGeneratingState = (next: boolean) => {
    setGenerating(next);
    onGeneratingChange?.(next);
  };

  const handleGenerate = async () => {
    const text = draft.trim();
    if (!text || generating || disabled) return;
    setError(null);
    setGeneratingState(true);
    try {
      if (annotationEditable) {
        // Reviewer/admin: never block. Pinyin uses the aligned model-answer
        // generator (one syllable per Han char, so a manual override renders
        // correctly) and English is best-effort — both fall back gracefully so
        // the reviewer can always proceed and fix them by hand.
        const [pinyin, translations] = await Promise.all([
          generateModelRomanisation(text, lang),
          fetchProperTranslations(
            [text],
            lang === "cantonese" ? "zh-HK" : "zh-CN",
          ),
        ]);
        onValueChange({
          chineseText: text,
          pinyin,
          english: translations?.join(" ").trim() || "",
        });
      } else {
        const annotation = await generateAnnotation(text, lang);
        onValueChange({
          chineseText: text,
          pinyin: annotation.pinyin,
          english: annotation.english,
        });
      }
    } catch {
      if (annotationEditable) {
        // Even a total failure must not block the reviewer — commit the typed
        // Chinese so they can add pinyin + English manually.
        onValueChange({ chineseText: text, pinyin: "", english: "" });
      } else {
        setError(
          "Could not generate pinyin and translation. Please press Enter to try again.",
        );
      }
    } finally {
      setGeneratingState(false);
    }
  };

  const handleEdit = () => {
    if (disabled || readOnly) return;
    setDraft(value?.chineseText ?? "");
    // Clearing the committed value re-opens the input and blocks submission
    // until the edited sentence has been regenerated.
    onValueChange(null);
  };

  const handleSpeak = () => {
    if (!value) return;
    if (isPlaying) {
      stop();
    } else {
      void speak(value.chineseText, {
        language: lang === "cantonese" ? "zh-HK" : "zh-CN",
        rate: "medium",
      });
    }
  };

  if (value) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card",
          compact ? "p-3 space-y-1" : "p-4 space-y-1.5",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Romanisation-on-top, tone-colored Chinese — same format as coaching
              notes. Student Mandarin re-derives pinyin live (jieba); Cantonese
              and reviewer-editable Mandarin render from the stored/edited pinyin
              so a manual override is what's shown. */}
          {lang === "cantonese" || annotationEditable ? (
            <ModelAnnotatedSentence
              chinese={value.chineseText}
              pinyin={value.pinyin}
              fontSize={
                compact ? ASSIGNMENT_CHAR_SIZE_COMPACT : ASSIGNMENT_CHAR_SIZE
              }
              className="text-foreground"
              lang={lang}
            />
          ) : (
            <AnnotatedSentence
              text={value.chineseText}
              fontSize={
                compact ? ASSIGNMENT_CHAR_SIZE_COMPACT : ASSIGNMENT_CHAR_SIZE
              }
              className="text-foreground"
            />
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleSpeak}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={isPlaying ? "Stop audio" : "Play audio"}
            >
              {ttsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={handleEdit}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                {editButtonLabel}
              </button>
            )}
          </div>
        </div>
        {annotationEditable ? (
          <div className="space-y-1.5 pt-1">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">
                {lang === "cantonese" ? "Jyutping" : "Pinyin"} (editable)
              </span>
              <input
                type="text"
                value={value.pinyin}
                onChange={(e) =>
                  onValueChange({ ...value, pinyin: e.target.value })
                }
                disabled={disabled}
                placeholder={
                  lang === "cantonese"
                    ? "Jyutping — one syllable per character"
                    : "Pinyin — one syllable per character"
                }
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">
                English translation (editable)
              </span>
              <input
                type="text"
                value={value.english}
                onChange={(e) =>
                  onValueChange({ ...value, english: e.target.value })
                }
                disabled={disabled}
                placeholder="English translation"
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 disabled:opacity-60"
              />
            </label>
          </div>
        ) : (
          value.english && (
            <p className="text-lg text-muted-foreground italic">
              {value.english}
            </p>
          )
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          placeholder={resolvedPlaceholder}
          disabled={disabled || generating}
          autoFocus={autoFocus}
          rows={compact ? 1 : 2}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 resize-y disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={disabled || generating || !draft.trim()}
          className="self-start inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            "Enter"
          )}
        </button>
      </div>
      {generating ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating pinyin and English translation...
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Type your sentence in Chinese, then press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
            Enter
          </kbd>{" "}
          to generate pinyin and English.
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
