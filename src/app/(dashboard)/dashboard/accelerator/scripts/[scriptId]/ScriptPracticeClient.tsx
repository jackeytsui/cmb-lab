"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
}

// ---------------------------------------------------------------------------
// Audio button
// ---------------------------------------------------------------------------

function AudioButton({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={handlePlay}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors",
          playing
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        )}
        title={`Play ${label}`}
      >
        <Play className="w-3 h-3" />
        {label}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Speech bubble
// ---------------------------------------------------------------------------

function SpeechBubble({
  line,
  role,
  roleName,
  isSpeaker,
}: {
  line: LineData;
  role: string;
  roleName: string;
  isSpeaker: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 space-y-2 border-2",
        isSpeaker
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-border bg-muted/50"
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

      {/* Cantonese */}
      <div>
        <p className="text-lg font-medium text-foreground">
          {line.cantoneseText}
        </p>
        <p className="text-xs text-muted-foreground">
          {line.cantoneseRomanisation}
        </p>
      </div>

      {/* Mandarin */}
      <div>
        <p className="text-lg font-medium text-foreground/80">
          {line.mandarinText}
        </p>
        <p className="text-xs text-muted-foreground">
          {line.mandarinRomanisation}
        </p>
      </div>

      {/* English */}
      <p className="text-sm text-muted-foreground italic">{line.englishText}</p>

      {/* Audio buttons */}
      <div className="flex gap-2 pt-1">
        {line.cantoneseAudioUrl && (
          <AudioButton src={line.cantoneseAudioUrl} label="Cantonese" />
        )}
        {line.mandarinAudioUrl && (
          <AudioButton src={line.mandarinAudioUrl} label="Mandarin" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScriptPracticeClient({
  script,
  lines,
  initialRatings,
}: ScriptPracticeClientProps) {
  const [ratings, setRatings] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const r of initialRatings) {
      map.set(r.lineId, r.selfRating);
    }
    return map;
  });

  const [scriptOpen, setScriptOpen] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const goodCount = Array.from(ratings.values()).filter(
    (v) => v === "good"
  ).length;
  const notGoodCount = Array.from(ratings.values()).filter(
    (v) => v === "not_good"
  ).length;
  const ratedCount = goodCount + notGoodCount;

  // -----------------------------------------------------------------------
  // Self-rating
  // -----------------------------------------------------------------------

  const handleRate = useCallback(
    async (lineId: string, selfRating: "good" | "not_good") => {
      setSaving(lineId);
      try {
        const res = await fetch("/api/accelerator/scripts/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineId, selfRating }),
        });
        if (!res.ok) throw new Error("Failed to save rating");

        setRatings((prev) => {
          const next = new Map(prev);
          next.set(lineId, selfRating);
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
  }, []);

  // -----------------------------------------------------------------------
  // Progress bar segments
  // -----------------------------------------------------------------------

  const progressPercent =
    lines.length > 0 ? Math.round((ratedCount / lines.length) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
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
            <p className="text-sm text-muted-foreground mt-0.5">
              {script.description}
            </p>
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
          <span>
            {ratedCount}/{lines.length} rated
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
          {lines.map((line) => {
            const r = ratings.get(line.id);
            let color = "bg-muted-foreground/20";
            if (r === "good") color = "bg-emerald-500";
            else if (r === "not_good") color = "bg-amber-500";
            return (
              <div
                key={line.id}
                className={`h-full ${color} transition-colors`}
                style={{ width: `${100 / lines.length}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Script toggle */}
      <button
        type="button"
        onClick={() => setScriptOpen(!scriptOpen)}
        className="flex items-center gap-2 text-lg font-semibold text-foreground hover:text-foreground/80 transition-colors"
      >
        Script
        {scriptOpen ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <ChevronDown className="w-5 h-5" />
        )}
      </button>

      {/* Script content */}
      {scriptOpen && (
        <div className="space-y-6">
          {lines.map((line) => {
            const isSpeaker = line.role === "speaker";
            const roleName = isSpeaker
              ? script.speakerRole
              : script.responderRole;
            const lineRating = ratings.get(line.id);
            const isLineSaving = saving === line.id;

            return (
              <div key={line.id} className="space-y-3">
                {/* Two-column: speech bubble left/right based on role */}
                <div
                  className={cn(
                    "flex gap-4",
                    isSpeaker ? "justify-start" : "justify-end"
                  )}
                >
                  <div className={cn("w-full max-w-lg", !isSpeaker && "ml-auto")}>
                    <SpeechBubble
                      line={line}
                      role={line.role}
                      roleName={roleName}
                      isSpeaker={isSpeaker}
                    />
                  </div>
                </div>

                {/* Self-check inline */}
                <div
                  className={cn(
                    "flex items-center gap-3",
                    isSpeaker ? "justify-start pl-2" : "justify-end pr-2"
                  )}
                >
                  {lineRating ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
                        lineRating === "good"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {lineRating === "good" ? "Good" : "Not so great"}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">
                        How did you do?
                      </span>
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
      )}

      {/* Summary / actions at bottom */}
      {ratedCount === lines.length && ratedCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-bold text-foreground">
            Practice Complete!
          </h2>
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {goodCount}
              </p>
              <p className="text-xs text-muted-foreground">Good</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {notGoodCount}
              </p>
              <p className="text-xs text-muted-foreground">Not so great</p>
            </div>
          </div>
          <Button variant="outline" onClick={resetAllRatings} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Practice Again
          </Button>
        </div>
      )}
    </div>
  );
}
