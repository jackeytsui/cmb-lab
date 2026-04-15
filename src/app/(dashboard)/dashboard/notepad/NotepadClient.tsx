"use client";

import { useState, useCallback } from "react";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { useProcessedChineseText, type ScriptMode } from "@/hooks/useProcessedChineseText";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import { Minus, Plus, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

type Language = "zh-CN" | "zh-HK";

const MIN_FONT = 16;
const MAX_FONT = 72;
const DEFAULT_FONT = 32;

/**
 * Single-language notepad pane. Student pastes Traditional Chinese, presses
 * Enter, and sees the processed output with per-character ruby, tone
 * coloring and sentence-level English translation.
 */
function NotepadPane({
  label,
  sublabel,
  language,
  fontSize,
  setFontSize,
  toneColorsEnabled,
}: {
  label: string;
  sublabel: string;
  language: Language;
  fontSize: number;
  setFontSize: (n: number) => void;
  toneColorsEnabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [committedText, setCommittedText] = useState("");
  const [scriptMode, setScriptMode] = useState<ScriptMode>("simplified");

  const pane = useProcessedChineseText({
    committedText,
    scriptMode,
    language,
  });

  const handleCommit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setCommittedText(text);
  }, [draft]);

  const isMandarin = language === "zh-CN";

  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <NotebookPen className="size-5 text-primary" />
            {label}
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
      {(pane.isConverting || pane.isSegmenting) && (
        <div className="mt-3 text-sm text-muted-foreground">
          {pane.isConverting ? "Converting..." : "Segmenting..."}
        </div>
      )}
      {pane.segments.length > 0 ? (
        <div className="mt-3">
          <ReaderTextArea
            segments={pane.segments}
            showPinyin={isMandarin}
            showJyutping={!isMandarin}
            showEnglish={true}
            translationMode="proper"
            fontSize={fontSize}
            language={language}
            onSpeakSentence={pane.handleSpeakSentence}
            isSpeaking={pane.isPlaying || pane.ttsLoading}
            speakingText={pane.speakingText}
            ttsError={pane.ttsError}
            translationCache={pane.translationCache}
            onTranslationFetched={(text, translation) => {
              pane.setTranslationCache((prev) => {
                const next = new Map(prev);
                next.set(text, translation);
                return next;
              });
            }}
            batchTranslations={pane.batchTranslations}
            isTranslating={pane.isTranslating}
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
  const [mandoFontSize, setMandoFontSize] = useState<number>(DEFAULT_FONT);
  const [cantoFontSize, setCantoFontSize] = useState<number>(DEFAULT_FONT);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Notepad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste Traditional Chinese on either side to see per-character pinyin
          or jyutping with tone coloring and English translation. Nothing is
          saved — this is a live notepad.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <NotepadPane
          label="Mandarin Output"
          sublabel="Simplified/Traditional display with Pinyin and Mandarin → English translation."
          language="zh-CN"
          fontSize={mandoFontSize}
          setFontSize={setMandoFontSize}
          toneColorsEnabled={toneColorsEnabled}
        />
        <NotepadPane
          label="Cantonese Output"
          sublabel="Simplified/Traditional display with Jyutping and Cantonese → English translation."
          language="zh-HK"
          fontSize={cantoFontSize}
          setFontSize={setCantoFontSize}
          toneColorsEnabled={toneColorsEnabled}
        />
      </div>
    </div>
  );
}
