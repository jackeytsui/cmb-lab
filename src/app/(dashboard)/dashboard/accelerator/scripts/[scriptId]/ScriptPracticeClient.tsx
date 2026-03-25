"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  RotateCcw,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTTS } from "@/hooks/useTTS";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScriptInfo {
  id: string;
  title: string;
  description: string | null;
  speakerRole: string;
  responderRole: string;
}

interface LineData {
  id: string;
  sortOrder: number;
  role: string;
  cantoneseText: string;
  mandarinText: string;
  cantoneseRomanisation: string;
  mandarinRomanisation: string;
  englishText: string;
  cantoneseAudioUrl: string | null;
  mandarinAudioUrl: string | null;
}

interface RatingEntry {
  lineId: string;
  selfRating: string;
}

interface ScriptPracticeClientProps {
  script: ScriptInfo;
  lines: LineData[];
  initialRatings: RatingEntry[];
  nextScriptId: string | null;
  nextScriptTitle: string | null;
}

// ---------------------------------------------------------------------------
// Speech bubble (single language)
// ---------------------------------------------------------------------------

function SpeechBubble({
  text,
  romanisation,
  englishText,
  roleName,
  isSpeaker,
  langColor,
  onPlay,
  ttsLoading,
  ttsPlaying,
  isHighlighted,
}: {
  text: string;
  romanisation: string;
  englishText: string;
  roleName: string;
  isSpeaker: boolean;
  langColor: "amber" | "sky";
  onPlay: () => void;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  isHighlighted: boolean;
}) {
  const romanColor = langColor === "amber"
    ? "text-amber-600 dark:text-amber-500"
    : "text-sky-600 dark:text-sky-500";

  return (
    <div
      className={cn(
        "rounded-xl p-4 space-y-2 border-2 transition-shadow",
        isSpeaker
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-border bg-muted/50",
        isHighlighted && "ring-2 ring-amber-500/50"
      )}
    >
      {/* Role label */}
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider font-semibold",
          isSpeaker
            ? "text-amber-600 dark:text-amber-400"
            : "text-sky-600 dark:text-sky-400"
        )}
      >
        {roleName}
      </span>

      {/* Romanisation above characters */}
      <div>
        <p className={cn("text-xs font-medium tracking-wide", romanColor)}>
          {romanisation}
        </p>
        <p className="text-lg font-medium text-foreground">{text}</p>
      </div>

      {/* English */}
      <p className="text-sm text-muted-foreground italic">{englishText}</p>

      {/* Play button */}
      <button
        type="button"
        onClick={onPlay}
        disabled={ttsLoading}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors",
          ttsPlaying
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent",
          ttsLoading && "opacity-50"
        )}
      >
        <Volume2 className="w-3.5 h-3.5" />
        {ttsLoading ? "Loading..." : ttsPlaying ? "Playing..." : "Listen"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language section
// ---------------------------------------------------------------------------

function LanguageSection({
  lang,
  langLabel,
  langColor,
  lines,
  script,
  ratings,
  saving,
  onRate,
  speak,
  ttsLoading,
  ttsPlaying,
  playingAllIndex,
  onPlayAll,
  isPlayingAll,
}: {
  lang: "cantonese" | "mandarin";
  langLabel: string;
  langColor: "amber" | "sky";
  lines: LineData[];
  script: ScriptInfo;
  ratings: Map<string, string>;
  saving: string | null;
  onRate: (lineId: string, rating: "good" | "not_good") => void;
  speak: (text: string, options?: { language: string }) => Promise<void>;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  playingAllIndex: number;
  onPlayAll: () => void;
  isPlayingAll: boolean;
}) {
  const [open, setOpen] = useState(true);
  const ttsLang = lang === "cantonese" ? "zh-HK" : "zh-CN";

  const ratingKey = (lineId: string) => `${lineId}-${lang}`;

  const ratedCount = lines.filter((l) => ratings.has(ratingKey(l.id))).length;
  const goodCount = lines.filter((l) => ratings.get(ratingKey(l.id)) === "good").length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-lg font-bold text-foreground"
        >
          <span className={cn(
            "w-3 h-3 rounded-full",
            langColor === "amber" ? "bg-amber-500" : "bg-sky-500"
          )} />
          {langLabel}
          <span className="text-sm font-normal text-muted-foreground">
            ({ratedCount}/{lines.length} rated)
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Play all for this language */}
      <button
        type="button"
        onClick={onPlayAll}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
          isPlayingAll
            ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-card text-foreground hover:bg-accent"
        )}
      >
        {isPlayingAll ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop Playback
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Play Full {langLabel} Conversation
          </>
        )}
      </button>

      {/* Lines */}
      {open && (
        <div className="space-y-5">
          {lines.map((line, idx) => {
            const isSpeaker = line.role === "speaker";
            const roleName = isSpeaker ? script.speakerRole : script.responderRole;
            const text = lang === "cantonese" ? line.cantoneseText : line.mandarinText;
            const roman = lang === "cantonese" ? line.cantoneseRomanisation : line.mandarinRomanisation;
            const rKey = ratingKey(line.id);
            const lineRating = ratings.get(rKey);
            const isLineSaving = saving === rKey;
            const isHighlighted = isPlayingAll && playingAllIndex === idx;

            return (
              <div key={line.id} className="space-y-2">
                <div className={cn("flex gap-4", isSpeaker ? "justify-start" : "justify-end")}>
                  <div className={cn("w-full max-w-lg", !isSpeaker && "ml-auto")}>
                    <SpeechBubble
                      text={text}
                      romanisation={roman}
                      englishText={line.englishText}
                      roleName={roleName}
                      isSpeaker={isSpeaker}
                      langColor={langColor}
                      onPlay={() => speak(text, { language: ttsLang })}
                      ttsLoading={ttsLoading}
                      ttsPlaying={ttsPlaying}
                      isHighlighted={isHighlighted}
                    />
                  </div>
                </div>

                {/* Self-check */}
                <div className={cn("flex items-center gap-3", isSpeaker ? "justify-start pl-2" : "justify-end pr-2")}>
                  {lineRating ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Map(ratings);
                        next.delete(rKey);
                        // We can't call setRatings directly, so use onRate hack — clear via parent
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
                        lineRating === "good"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {lineRating === "good" ? "Good" : "Not so great"}
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">How did you do?</span>
                      <button
                        type="button"
                        onClick={() => onRate(line.id, "good")}
                        disabled={!!isLineSaving}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        Good
                      </button>
                      <button
                        type="button"
                        onClick={() => onRate(line.id, "not_good")}
                        disabled={!!isLineSaving}
                        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        Not so great
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScriptPracticeClient({
  script,
  lines,
  initialRatings,
  nextScriptId,
}: ScriptPracticeClientProps) {
  const [ratings, setRatings] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const r of initialRatings) {
      // Store with lang suffix for separate tracking
      map.set(`${r.lineId}-cantonese`, r.selfRating);
      map.set(`${r.lineId}-mandarin`, r.selfRating);
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);

  // TTS
  const { speak, stop: stopTTS, isLoading: ttsLoading, isPlaying: ttsPlaying } = useTTS();

  // Play all state
  const [playingAllLang, setPlayingAllLang] = useState<"cantonese" | "mandarin" | null>(null);
  const [playingAllIndex, setPlayingAllIndex] = useState(-1);
  const playAllAbortRef = useRef(false);

  const totalRatable = lines.length * 2; // each line rated for both languages
  const ratedCount = ratings.size;
  const progressPercent = totalRatable > 0 ? Math.round((ratedCount / totalRatable) * 100) : 0;

  const handleRate = useCallback(
    async (lineId: string, selfRating: "good" | "not_good") => {
      // Rate for both languages at once (simpler UX)
      const cantoKey = `${lineId}-cantonese`;
      const mandoKey = `${lineId}-mandarin`;
      setSaving(cantoKey);

      try {
        const res = await fetch("/api/accelerator/scripts/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineId, selfRating }),
        });
        if (!res.ok) throw new Error("Failed to save rating");
        setRatings((prev) => {
          const next = new Map(prev);
          next.set(cantoKey, selfRating);
          next.set(mandoKey, selfRating);
          return next;
        });
      } catch (err) {
        console.error("Error saving rating:", err);
      } finally {
        setSaving(null);
      }
    },
    []
  );

  const resetAllRatings = useCallback(() => {
    setRatings(new Map());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Play all for a language using TTS
  const handlePlayAll = useCallback(
    async (lang: "cantonese" | "mandarin") => {
      if (playingAllLang === lang) {
        // Stop
        playAllAbortRef.current = true;
        stopTTS();
        setPlayingAllLang(null);
        setPlayingAllIndex(-1);
        return;
      }

      // Stop any other playback
      stopTTS();
      setPlayingAllLang(lang);
      playAllAbortRef.current = false;

      const ttsLang = lang === "cantonese" ? "zh-HK" : "zh-CN";

      for (let i = 0; i < lines.length; i++) {
        if (playAllAbortRef.current) break;
        setPlayingAllIndex(i);
        const text = lang === "cantonese" ? lines[i].cantoneseText : lines[i].mandarinText;

        await new Promise<void>((resolve) => {
          speak(text, { language: ttsLang }).then(() => {
            // Wait a bit after speech ends
            setTimeout(resolve, 600);
          }).catch(() => resolve());
        });
      }

      setPlayingAllLang(null);
      setPlayingAllIndex(-1);
    },
    [playingAllLang, lines, speak, stopTTS]
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-8 pb-36">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/accelerator/scripts"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-center flex-1">
          <h1 className="text-xl font-bold text-foreground">{script.title}</h1>
          {script.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{script.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {script.speakerRole} &amp; {script.responderRole}
          </p>
        </div>
        <div className="w-5" />
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{Math.floor(ratedCount / 2)}/{lines.length} lines rated</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Cantonese section */}
      <LanguageSection
        lang="cantonese"
        langLabel="Cantonese"
        langColor="amber"
        lines={lines}
        script={script}
        ratings={ratings}
        saving={saving}
        onRate={handleRate}
        speak={speak}
        ttsLoading={ttsLoading}
        ttsPlaying={ttsPlaying}
        playingAllIndex={playingAllLang === "cantonese" ? playingAllIndex : -1}
        onPlayAll={() => handlePlayAll("cantonese")}
        isPlayingAll={playingAllLang === "cantonese"}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Mandarin section */}
      <LanguageSection
        lang="mandarin"
        langLabel="Mandarin"
        langColor="sky"
        lines={lines}
        script={script}
        ratings={ratings}
        saving={saving}
        onRate={handleRate}
        speak={speak}
        ttsLoading={ttsLoading}
        ttsPlaying={ttsPlaying}
        playingAllIndex={playingAllLang === "mandarin" ? playingAllIndex : -1}
        onPlayAll={() => handlePlayAll("mandarin")}
        isPlayingAll={playingAllLang === "mandarin"}
      />

      {/* Self-check reminder */}
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Rate each sentence as <span className="text-emerald-500 font-medium">Good</span> or{" "}
          <span className="text-amber-500 font-medium">Not so great</span> to track your progress and focus your practice.
        </p>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          <Button variant="outline" onClick={resetAllRatings} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Practice Again
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{Math.floor(ratedCount / 2)}/{lines.length}</span>
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {nextScriptId ? (
            <Link href={`/dashboard/accelerator/scripts/${nextScriptId}`}>
              <Button className="gap-2">
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard/accelerator/scripts">
              <Button variant="outline" className="gap-2">
                All Scripts
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
