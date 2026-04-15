"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { useProcessedChineseText, type ScriptMode } from "@/hooks/useProcessedChineseText";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import { Minus, Plus, NotebookPen, Trash2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Language = "zh-CN" | "zh-HK";
type Pane = "mandarin" | "cantonese";

const MIN_FONT = 16;
const MAX_FONT = 72;
const DEFAULT_FONT = 32;
const SAVE_DEBOUNCE_MS = 600;

type PaneState = {
  text: string;
  scriptMode: ScriptMode;
  fontSize: number;
};

type SaveStatus = "idle" | "saving" | "saved";

async function loadNotepadState(): Promise<Record<Pane, PaneState | null>> {
  try {
    const res = await fetch("/api/notepad", { cache: "no-store" });
    if (!res.ok) return { mandarin: null, cantonese: null };
    const data = await res.json();
    return {
      mandarin: data.mandarin
        ? {
            text: data.mandarin.text ?? "",
            scriptMode: data.mandarin.scriptMode === "traditional" ? "traditional" : "simplified",
            fontSize:
              typeof data.mandarin.fontSize === "number" ? data.mandarin.fontSize : DEFAULT_FONT,
          }
        : null,
      cantonese: data.cantonese
        ? {
            text: data.cantonese.text ?? "",
            scriptMode: data.cantonese.scriptMode === "traditional" ? "traditional" : "simplified",
            fontSize:
              typeof data.cantonese.fontSize === "number" ? data.cantonese.fontSize : DEFAULT_FONT,
          }
        : null,
    };
  } catch {
    return { mandarin: null, cantonese: null };
  }
}

async function saveNotepadPane(pane: Pane, state: PaneState): Promise<boolean> {
  try {
    const res = await fetch("/api/notepad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pane, ...state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function clearNotepadPane(pane: Pane): Promise<boolean> {
  try {
    const res = await fetch(`/api/notepad?pane=${pane}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Single-language notepad pane. Student pastes Traditional Chinese, presses
 * Enter, and sees the processed output with per-character ruby, tone
 * coloring and sentence-level English translation. Text + script mode +
 * font size are persisted per-user via /api/notepad (debounced saves).
 */
function NotepadPane({
  pane,
  label,
  sublabel,
  language,
  initial,
  hydrated,
  toneColorsEnabled,
}: {
  pane: Pane;
  label: string;
  sublabel: string;
  language: Language;
  initial: PaneState | null;
  hydrated: boolean;
  toneColorsEnabled: boolean;
}) {
  const [draft, setDraft] = useState(initial?.text ?? "");
  const [committedText, setCommittedText] = useState(initial?.text ?? "");
  const [scriptMode, setScriptMode] = useState<ScriptMode>(initial?.scriptMode ?? "simplified");
  const [fontSize, setFontSize] = useState<number>(initial?.fontSize ?? DEFAULT_FONT);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const processed = useProcessedChineseText({
    committedText,
    scriptMode,
    language,
  });

  // Hydrate when async load finishes
  useEffect(() => {
    if (!hydrated) return;
    setDraft(initial?.text ?? "");
    setCommittedText(initial?.text ?? "");
    setScriptMode(initial?.scriptMode ?? "simplified");
    setFontSize(initial?.fontSize ?? DEFAULT_FONT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Debounced persistence. Starts AFTER hydration to avoid clobbering with
  // empty state before the initial load completes.
  const savedSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!hydrated) return;
    const snap = JSON.stringify({ committedText, scriptMode, fontSize });
    if (snap === savedSnapshotRef.current) return;

    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      const ok = await saveNotepadPane(pane, {
        text: committedText,
        scriptMode,
        fontSize,
      });
      if (ok) {
        savedSnapshotRef.current = snap;
        setSaveStatus("saved");
        setTimeout(() => {
          setSaveStatus((s) => (s === "saved" ? "idle" : s));
        }, 1500);
      } else {
        setSaveStatus("idle");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [committedText, scriptMode, fontSize, pane, hydrated]);

  const handleCommit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setCommittedText(text);
  }, [draft]);

  const handleClear = useCallback(async () => {
    setDraft("");
    setCommittedText("");
    savedSnapshotRef.current = JSON.stringify({
      committedText: "",
      scriptMode,
      fontSize,
    });
    await clearNotepadPane(pane);
  }, [pane, scriptMode, fontSize]);

  const isMandarin = language === "zh-CN";

  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <NotebookPen className="size-5 text-primary" />
            {label}
            {saveStatus === "saving" && (
              <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
            )}
            {saveStatus === "saved" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" />
                Saved
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
        </div>

        <div className="flex items-center gap-3">
          {/* Simplified / Traditional toggle */}
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setScriptMode("simplified")}
              className={cn(
                "px-2.5 py-1 transition-colors",
                scriptMode === "simplified"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Simplified
            </button>
            <button
              type="button"
              onClick={() => setScriptMode("traditional")}
              className={cn(
                "px-2.5 py-1 transition-colors",
                scriptMode === "traditional"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Traditional
            </button>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Font size</span>
            <button
              type="button"
              onClick={() => setFontSize(Math.max(MIN_FONT, fontSize - 2))}
              className="size-6 rounded-md border border-border hover:bg-accent flex items-center justify-center"
              aria-label="Decrease font size"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-8 text-center tabular-nums text-foreground">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize(Math.min(MAX_FONT, fontSize + 2))}
              className="size-6 rounded-md border border-border hover:bg-accent flex items-center justify-center"
              aria-label="Increase font size"
            >
              <Plus className="size-3" />
            </button>
          </div>

          {committedText && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Clear this notepad"
            >
              <Trash2 className="size-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Input */}
      <label className="text-xs font-medium text-muted-foreground">
        Traditional Chinese Input ({isMandarin ? "Mandarin" : "Cantonese"})
      </label>
      <div className="mt-1 flex items-stretch gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCommit();
            }
          }}
          rows={1}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          placeholder="Paste or type Traditional Chinese here..."
        />
        <button
          type="button"
          onClick={handleCommit}
          disabled={!draft.trim()}
          className="rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        >
          Enter
        </button>
      </div>

      {/* Output */}
      {(processed.isConverting || processed.isSegmenting) && (
        <div className="mt-3 text-sm text-muted-foreground">
          {processed.isConverting ? "Converting..." : "Segmenting..."}
        </div>
      )}
      {processed.segments.length > 0 ? (
        <div className="mt-3">
          <ReaderTextArea
            segments={processed.segments}
            showPinyin={isMandarin}
            showJyutping={!isMandarin}
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
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          Paste or type Chinese text above and press Enter to render.
        </div>
      )}
    </div>
  );
}

export function NotepadClient() {
  const { toneColorsEnabled } = useReaderPreferences("notepad");
  const [initial, setInitial] = useState<Record<Pane, PaneState | null>>({
    mandarin: null,
    cantonese: null,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadNotepadState().then((state) => {
      if (cancelled) return;
      setInitial(state);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Notepad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste Traditional Chinese on either side to see per-character pinyin
          or jyutping with tone coloring and English translation. Your notepad
          auto-saves and is restored next time you visit.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <NotepadPane
          pane="mandarin"
          label="Mandarin Output"
          sublabel="Simplified/Traditional display with Pinyin and Mandarin → English translation."
          language="zh-CN"
          initial={initial.mandarin}
          hydrated={hydrated}
          toneColorsEnabled={toneColorsEnabled}
        />
        <NotepadPane
          pane="cantonese"
          label="Cantonese Output"
          sublabel="Simplified/Traditional display with Jyutping and Cantonese → English translation."
          language="zh-HK"
          initial={initial.cantonese}
          hydrated={hydrated}
          toneColorsEnabled={toneColorsEnabled}
        />
      </div>
    </div>
  );
}
