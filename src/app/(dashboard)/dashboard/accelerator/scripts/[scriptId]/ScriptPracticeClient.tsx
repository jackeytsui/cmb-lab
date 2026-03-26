"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Pause,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTTS, type TTSOptions } from "@/hooks/useTTS";

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
  prevScriptId: string | null;
  nextScriptId: string | null;
  nextScriptTitle: string | null;
}

// ---------------------------------------------------------------------------
// Single language bubble (used inside the split line)
// ---------------------------------------------------------------------------

function LangBubble({
  label,
  text,
  romanisation,
  labelColor,
  onPlay,
  isPlaying,
}: {
  label: string;
  text: string;
  romanisation: string;
  labelColor: string;
  onPlay: () => void;
  isPlaying: boolean;
}) {
  return (
    <div className="flex-1 p-4 space-y-2">
      <span className={cn("text-[10px] uppercase tracking-wider font-bold", labelColor)}>
        {label}
      </span>
      <p className={cn("text-xs font-medium tracking-wide text-muted-foreground")}>
        {romanisation}
      </p>
      <p className="text-lg font-medium text-foreground">{text}</p>
      <button
        type="button"
        onClick={onPlay}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
          isPlaying
            ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
            : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border"
        )}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        {isPlaying ? "Playing..." : "Play"}
      </button>
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
  prevScriptId,
  nextScriptId,
}: ScriptPracticeClientProps) {
  const [ratings, setRatings] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const r of initialRatings) {
      map.set(r.lineId, r.selfRating);
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);

  // TTS
  const { speak, stop: stopTTS, isLoading: ttsLoading, isPlaying: ttsPlaying } = useTTS();
  const [playingLineKey, setPlayingLineKey] = useState<string | null>(null);

  // Play all state
  const [playingAllLang, setPlayingAllLang] = useState<"cantonese" | "mandarin" | null>(null);
  const [playingAllIndex, setPlayingAllIndex] = useState(-1);
  const playAllAbortRef = useRef(false);

  const ratedCount = ratings.size;
  const progressPercent = lines.length > 0 ? Math.round((ratedCount / lines.length) * 100) : 0;

  const handleRate = useCallback(
    async (lineId: string, selfRating: "good" | "not_good") => {
      setSaving(lineId);
      try {
        const res = await fetch("/api/accelerator/scripts/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineId, selfRating }),
        });
        if (!res.ok) throw new Error("Failed");
        setRatings((prev) => new Map(prev).set(lineId, selfRating));
      } catch {
        // ignore
      } finally {
        setSaving(null);
      }
    },
    []
  );

  const handlePlayLine = useCallback(
    (text: string, lang: "cantonese" | "mandarin", lineId: string) => {
      const key = `${lineId}-${lang}`;
      setPlayingLineKey(key);
      speak(text, { language: lang === "cantonese" ? "zh-HK" : "zh-CN" })
        .finally(() => setPlayingLineKey(null));
    },
    [speak]
  );

  // Play all for a language
  const handlePlayAll = useCallback(
    async (lang: "cantonese" | "mandarin") => {
      if (playingAllLang === lang) {
        playAllAbortRef.current = true;
        stopTTS();
        setPlayingAllLang(null);
        setPlayingAllIndex(-1);
        return;
      }

      stopTTS();
      setPlayingAllLang(lang);
      playAllAbortRef.current = false;

      const ttsLang = lang === "cantonese" ? "zh-HK" : "zh-CN";

      for (let i = 0; i < lines.length; i++) {
        if (playAllAbortRef.current) break;
        setPlayingAllIndex(i);
        const text = lang === "cantonese" ? lines[i].cantoneseText : lines[i].mandarinText;
        await new Promise<void>((resolve) => {
          speak(text, { language: ttsLang })
            .then(() => setTimeout(resolve, 500))
            .catch(() => resolve());
        });
      }

      setPlayingAllLang(null);
      setPlayingAllIndex(-1);
    },
    [playingAllLang, lines, speak, stopTTS]
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6 pb-28">
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
          <span>{ratedCount}/{lines.length} lines rated</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Play full conversation buttons — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handlePlayAll("cantonese")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
            playingAllLang === "cantonese"
              ? "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              : "border-border bg-card text-foreground hover:bg-accent"
          )}
        >
          {playingAllLang === "cantonese" ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Play All Cantonese
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => handlePlayAll("mandarin")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
            playingAllLang === "mandarin"
              ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-border bg-card text-foreground hover:bg-accent"
          )}
        >
          {playingAllLang === "mandarin" ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Play All Mandarin
            </>
          )}
        </button>
      </div>

      {/* Conversation lines — split Cantonese | Mandarin */}
      <div className="space-y-4">
        {lines.map((line, idx) => {
          const isSpeaker = line.role === "speaker";
          const roleName = isSpeaker ? script.speakerRole : script.responderRole;
          const lineRating = ratings.get(line.id);
          const isLineSaving = saving === line.id;
          const isCantoHighlighted = playingAllLang === "cantonese" && playingAllIndex === idx;
          const isMandoHighlighted = playingAllLang === "mandarin" && playingAllIndex === idx;

          return (
            <div key={line.id} className="space-y-2">
              {/* English + role label */}
              <div className="flex items-center gap-2 px-1">
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-bold",
                  isSpeaker ? "text-amber-500" : "text-sky-500"
                )}>
                  {roleName}
                </span>
                <span className="text-sm text-muted-foreground">—</span>
                <span className="text-sm font-medium text-foreground italic">
                  {line.englishText}
                </span>
              </div>

              {/* Split card: Cantonese | Mandarin */}
              <div className={cn(
                "rounded-xl border-2 overflow-hidden grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border",
                isSpeaker ? "border-amber-500/30" : "border-border",
                (isCantoHighlighted || isMandoHighlighted) && "ring-2 ring-cyan-500/40"
              )}>
                <LangBubble
                  label="Cantonese"
                  text={line.cantoneseText}
                  romanisation={line.cantoneseRomanisation}
                  labelColor="text-cyan-500"
                  onPlay={() => handlePlayLine(line.cantoneseText, "cantonese", line.id)}
                  isPlaying={playingLineKey === `${line.id}-cantonese` && ttsPlaying}
                />
                <LangBubble
                  label="Mandarin"
                  text={line.mandarinText}
                  romanisation={line.mandarinRomanisation}
                  labelColor="text-red-500"
                  onPlay={() => handlePlayLine(line.mandarinText, "mandarin", line.id)}
                  isPlaying={playingLineKey === `${line.id}-mandarin` && ttsPlaying}
                />
              </div>

              {/* Self-check */}
              <div className="flex items-center gap-3 px-1">
                {lineRating ? (
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
                    lineRating === "good"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  )}>
                    <CheckCircle className="w-3 h-3" />
                    {lineRating === "good" ? "Good" : "Not so great"}
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">How did you do?</span>
                    <button
                      type="button"
                      onClick={() => handleRate(line.id, "good")}
                      disabled={isLineSaving}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      Good
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate(line.id, "not_good")}
                      disabled={isLineSaving}
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

      {/* Sticky bottom bar — Previous / progress / Next */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          {prevScriptId ? (
            <Link href={`/dashboard/accelerator/scripts/${prevScriptId}`}>
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Previous
              </Button>
            </Link>
          ) : (
            <Button variant="outline" className="gap-2" disabled>
              <ArrowLeft className="w-4 h-4" />
              Previous
            </Button>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{ratedCount}/{lines.length}</span>
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
            <Button className="gap-2" disabled>
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
