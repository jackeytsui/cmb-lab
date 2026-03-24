"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ThumbsUp,
  ThumbsDown,
  Play,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<"practice" | "summary" | "revisit">(
    "practice"
  );
  const [saving, setSaving] = useState(false);

  const cantoAudioRef = useRef<HTMLAudioElement>(null);
  const mandoAudioRef = useRef<HTMLAudioElement>(null);

  // Filter lines for revisit mode
  const activeLines =
    mode === "revisit"
      ? lines.filter((l) => ratings.get(l.id) === "not_good")
      : lines;

  const currentLine = activeLines[currentIndex];
  const totalLines = activeLines.length;

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
    async (selfRating: "good" | "not_good") => {
      if (!currentLine || saving) return;
      setSaving(true);

      try {
        const res = await fetch("/api/accelerator/scripts/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineId: currentLine.id, selfRating }),
        });

        if (!res.ok) throw new Error("Failed to save rating");

        setRatings((prev) => {
          const next = new Map(prev);
          next.set(currentLine.id, selfRating);
          return next;
        });

        // Auto-advance or show summary
        if (currentIndex < totalLines - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setMode("summary");
        }
      } catch (err) {
        console.error("Error saving rating:", err);
      } finally {
        setSaving(false);
      }
    },
    [currentLine, currentIndex, totalLines, saving]
  );

  // -----------------------------------------------------------------------
  // Audio playback
  // -----------------------------------------------------------------------

  function playAudio(ref: React.RefObject<HTMLAudioElement | null>) {
    if (ref.current) {
      ref.current.currentTime = 0;
      ref.current.play();
    }
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  function goToLine(index: number) {
    if (index >= 0 && index < totalLines) {
      setCurrentIndex(index);
    }
  }

  function startRevisit() {
    const notGoodLines = lines.filter(
      (l) => ratings.get(l.id) === "not_good"
    );
    if (notGoodLines.length === 0) return;
    setMode("revisit");
    setCurrentIndex(0);
  }

  function restartPractice() {
    setMode("practice");
    setCurrentIndex(0);
  }

  // -----------------------------------------------------------------------
  // Summary view
  // -----------------------------------------------------------------------

  if (mode === "summary") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center space-y-6">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
          <h1 className="text-2xl font-bold text-zinc-100">
            Practice Complete!
          </h1>
          <p className="text-zinc-400">{script.title}</p>

          <div className="flex justify-center gap-8 py-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">{goodCount}</p>
              <p className="text-sm text-zinc-400">Good</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-400">
                {notGoodCount}
              </p>
              <p className="text-sm text-zinc-400">Not Good</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-zinc-300">
                {lines.length - ratedCount}
              </p>
              <p className="text-sm text-zinc-400">Skipped</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-center">
            {notGoodCount > 0 && (
              <Button onClick={startRevisit} className="w-60">
                <RotateCcw className="w-4 h-4 mr-2" />
                Revisit Not-Good Lines ({notGoodCount})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={restartPractice}
              className="w-60"
            >
              Restart All Lines
            </Button>
            <Link href="/dashboard/accelerator/scripts">
              <Button variant="ghost" className="w-60">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Scripts
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Practice view (one line at a time)
  // -----------------------------------------------------------------------

  if (!currentLine) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-zinc-400">No lines to practice.</p>
        <Link href="/dashboard/accelerator/scripts">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Scripts
          </Button>
        </Link>
      </div>
    );
  }

  const roleName =
    currentLine.role === "speaker"
      ? script.speakerRole
      : script.responderRole;

  const lineRating = ratings.get(currentLine.id);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/accelerator/scripts"
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-zinc-100">
            {script.title}
          </h1>
          <p className="text-xs text-zinc-500">
            {script.speakerRole} / {script.responderRole}
          </p>
        </div>
        <div className="w-5" />
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            Line {currentIndex + 1} of {totalLines}
          </span>
          <span>
            {ratedCount}/{lines.length} rated
          </span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          {lines.map((line) => {
            const r = ratings.get(line.id);
            let color = "bg-zinc-700";
            if (r === "good") color = "bg-green-500";
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

      {/* Current line card */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/50 overflow-hidden">
        {/* Role badge */}
        <div className="px-5 pt-4 pb-2">
          <span
            className={`text-xs font-medium px-3 py-1 rounded-full ${
              currentLine.role === "speaker"
                ? "bg-blue-900/40 text-blue-400"
                : "bg-emerald-900/40 text-emerald-400"
            }`}
          >
            {roleName}
          </span>
        </div>

        {/* Two-column layout: role label + content */}
        <div className="px-5 pb-5 space-y-4">
          {/* Cantonese block (shown first per D-16) */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">
              Cantonese
            </p>
            <p className="text-xl font-medium text-amber-200">
              {currentLine.cantoneseText}
            </p>
            <p className="text-sm text-zinc-400">
              {currentLine.cantoneseRomanisation}
            </p>
            <p className="text-sm text-zinc-500 italic">
              {currentLine.englishText}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Mandarin block */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-sky-500 font-semibold">
              Mandarin
            </p>
            <p className="text-xl font-medium text-sky-200">
              {currentLine.mandarinText}
            </p>
            <p className="text-sm text-zinc-400">
              {currentLine.mandarinRomanisation}
            </p>
          </div>
        </div>
      </div>

      {/* Audio hidden elements */}
      {currentLine.cantoneseAudioUrl && (
        <audio ref={cantoAudioRef} src={currentLine.cantoneseAudioUrl} preload="auto" />
      )}
      {currentLine.mandarinAudioUrl && (
        <audio ref={mandoAudioRef} src={currentLine.mandarinAudioUrl} preload="auto" />
      )}

      {/* Audio playback buttons */}
      <div className="flex justify-center gap-3">
        {currentLine.cantoneseAudioUrl && (
          <Button
            variant="outline"
            onClick={() => playAudio(cantoAudioRef)}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Play Cantonese
          </Button>
        )}
        {currentLine.mandarinAudioUrl && (
          <Button
            variant="outline"
            onClick={() => playAudio(mandoAudioRef)}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Play Mandarin
          </Button>
        )}
      </div>

      {/* Self-rating buttons */}
      <div className="space-y-2">
        <p className="text-center text-sm text-zinc-400">
          How did you do on this line?
        </p>
        <div className="flex justify-center gap-4">
          <Button
            onClick={() => handleRate("good")}
            disabled={saving}
            className={`gap-2 px-6 ${
              lineRating === "good"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-green-900/40 hover:bg-green-900/60 text-green-400"
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
            Good
          </Button>
          <Button
            onClick={() => handleRate("not_good")}
            disabled={saving}
            className={`gap-2 px-6 ${
              lineRating === "not_good"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-amber-900/40 hover:bg-amber-900/60 text-amber-400"
            }`}
          >
            <ThumbsDown className="w-4 h-4" />
            Not Good
          </Button>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between pt-2">
        <Button
          variant="ghost"
          onClick={() => goToLine(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (currentIndex < totalLines - 1) {
              goToLine(currentIndex + 1);
            } else {
              setMode("summary");
            }
          }}
          className="gap-1"
        >
          {currentIndex < totalLines - 1 ? (
            <>
              Skip
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            "Finish"
          )}
        </Button>
      </div>
    </div>
  );
}
