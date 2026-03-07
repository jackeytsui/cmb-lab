"use client";

import { FileText, Minus, Plus, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ScriptMode } from "@/lib/chinese-convert";
import { cn } from "@/lib/utils";

export interface ReaderToolbarProps {
  showPinyin: boolean;
  showJyutping: boolean;
  showEnglish: boolean;
  translationMode: "proper" | "direct";
  scriptMode: ScriptMode;
  fontSize: number;
  ttsLanguage: "zh-CN" | "zh-HK";
  onShowPinyinChange: (v: boolean) => void;
  onShowJyutpingChange: (v: boolean) => void;
  onShowEnglishChange: (v: boolean) => void;
  onTranslationModeChange: (mode: "proper" | "direct") => void;
  onScriptModeChange: (mode: ScriptMode) => void;
  onFontSizeChange: (size: number) => void;
  onTtsLanguageChange: (lang: "zh-CN" | "zh-HK") => void;
  onImportClick: () => void;
  importButtonTourId?: string;
  onPlayAll?: () => void;
  onStopAll?: () => void;
  isPlayingAll?: boolean;
  isLoadingTts?: boolean;
  disablePlayAll?: boolean;
}

const FONT_SIZE_MIN = 14;
const FONT_SIZE_MAX = 40;
const FONT_SIZE_STEP = 2;

function Toggle({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={cn(
          "size-3.5 rounded border border-border transition-colors flex items-center justify-center",
          checked
            ? `${color ?? "bg-primary border-primary"} text-white`
            : "bg-background",
        )}
      >
        {checked && (
          <svg className="size-2.5" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span
        className={
          checked ? "text-foreground/90" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </label>
  );
}

export function ReaderToolbar({
  showPinyin,
  showJyutping,
  showEnglish,
  translationMode,
  scriptMode,
  fontSize,
  ttsLanguage,
  onShowPinyinChange,
  onShowJyutpingChange,
  onShowEnglishChange,
  onTranslationModeChange,
  onScriptModeChange,
  onFontSizeChange,
  onTtsLanguageChange,
  onImportClick,
  importButtonTourId,
  onPlayAll,
  onStopAll,
  isPlayingAll,
  isLoadingTts,
  disablePlayAll = false,
}: ReaderToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/80 p-2 backdrop-blur">
      {/* Import */}
      <Button
        variant="outline"
        size="sm"
        onClick={onImportClick}
        data-tour-id={importButtonTourId}
        className="border-border bg-background text-foreground/90 hover:bg-muted"
      >
        <FileText className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6 bg-border" />

      {/* Annotation toggles */}
      <div className="flex items-center gap-3">
        <Toggle
          label="Pinyin"
          checked={showPinyin}
          onChange={onShowPinyinChange}
          color="bg-blue-500 border-blue-500"
        />
        <Toggle
          label="Jyutping"
          checked={showJyutping}
          onChange={onShowJyutpingChange}
          color="bg-orange-500 border-orange-500"
        />
        <Toggle
          label={showEnglish ? "Hide Translation" : "Show Translation"}
          checked={showEnglish}
          onChange={onShowEnglishChange}
          color="bg-emerald-500 border-emerald-500"
        />
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 bg-border" />

      {/* Translation mode (only meaningful when English is on) */}
      <div
        className={cn(
          "inline-flex items-center rounded-md bg-muted p-0.5",
          !showEnglish && "opacity-40",
        )}
      >
        <button
          type="button"
          onClick={() => onTranslationModeChange("proper")}
          disabled={!showEnglish}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            translationMode === "proper" && showEnglish
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Proper
        </button>
        <button
          type="button"
          onClick={() => onTranslationModeChange("direct")}
          disabled={!showEnglish}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            translationMode === "direct" && showEnglish
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Direct
        </button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 bg-border" />

      {/* Script mode */}
      <div className="inline-flex items-center rounded-md bg-muted p-0.5">
        <button
          type="button"
          onClick={() =>
            onScriptModeChange(
              scriptMode === "simplified" ? "original" : "simplified",
            )
          }
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            scriptMode === "simplified"
              ? "bg-cyan-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Simplified
        </button>
        <button
          type="button"
          onClick={() =>
            onScriptModeChange(
              scriptMode === "traditional" ? "original" : "traditional",
            )
          }
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            scriptMode === "traditional"
              ? "bg-cyan-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Traditional
        </button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 bg-border" />

      {/* TTS language toggle */}
      <div className="inline-flex items-center rounded-md bg-muted p-0.5">
        <button
          type="button"
          onClick={() => onTtsLanguageChange("zh-CN")}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            ttsLanguage === "zh-CN"
              ? "bg-violet-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mando
        </button>
        <button
          type="button"
          onClick={() => onTtsLanguageChange("zh-HK")}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            ttsLanguage === "zh-HK"
              ? "bg-violet-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Canto
        </button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6 bg-border" />

      {/* Play All TTS */}
      {onPlayAll && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={isPlayingAll ? onStopAll : onPlayAll}
            disabled={isLoadingTts || disablePlayAll}
            className="text-muted-foreground hover:text-violet-500 hover:bg-muted"
          >
            {isLoadingTts ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isPlayingAll ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            <span className="hidden sm:inline ml-1">
              {isPlayingAll ? "Stop" : "Play All"}
            </span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6 bg-border" />
        </>
      )}

      {/* Font size */}
      <div className="inline-flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            onFontSizeChange(
              Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP),
            )
          }
          disabled={fontSize <= FONT_SIZE_MIN}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Minus className="size-3" />
        </Button>
        <span className="min-w-[3ch] text-center text-xs tabular-nums text-muted-foreground">
          {fontSize}px
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            onFontSizeChange(
              Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP),
            )
          }
          disabled={fontSize >= FONT_SIZE_MAX}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
