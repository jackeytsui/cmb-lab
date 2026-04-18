"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import { smartRomanise } from "@/lib/romanise";

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
// Ruby renderer: align stored romanization syllables over each CJK character.
// Non-CJK characters (punctuation, English, spaces) pass through without ruby.
// Respects coach-edited romanisation text. Splits syllables by runs of
// letter+mark+digit chars so punctuation stuck to a syllable (e.g. `，qǐng`
// or `jian ma？`) still parses cleanly. As a fallback for jyutping stored
// without spaces (e.g. `cing2man6nei1dou6`), splits after each tone digit.
// If syllable count still doesn't match CJK character count, falls back to
// showing the full romanisation line above the text.
// ---------------------------------------------------------------------------

const CJK_REGEX = /[\u3400-\u9fff]/;

function extractSyllables(romanisation: string): string[] {
  // Primary: runs of letters/diacritics/digits — robust against punctuation
  // glued onto syllables with no whitespace.
  const matches = Array.from(romanisation.matchAll(/[\p{L}\p{M}\p{N}]+/gu)).map(
    (m) => m[0],
  );
  return matches;
}

function splitJyutpingByTone(romanisation: string): string[] {
  // Jyutping syllables end in a tone digit 1-6. Split after each digit so
  // `cing2man6nei1dou6` -> ["cing2", "man6", "nei1", "dou6"].
  const out: string[] = [];
  const re = /[\p{L}\p{M}]+[1-6]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(romanisation)) !== null) out.push(m[0]);
  return out;
}

function RubyLine({ text, romanisation }: { text: string; romanisation: string }) {
  const rendered = useMemo(() => {
    if (!text) return null;

    const cjkCharCount = Array.from(text).filter((c) => CJK_REGEX.test(c)).length;

    let syllables = extractSyllables(romanisation);
    if (syllables.length !== cjkCharCount) {
      // Try jyutping tone-digit split for coach-edited Cantonese with no spaces
      const toneSplit = splitJyutpingByTone(romanisation);
      if (toneSplit.length === cjkCharCount) syllables = toneSplit;
    }

    // Fallback: syllable count doesn't align with CJK characters — show as one
    // line of ruby above the whole sentence instead of per-character.
    const canAlign = cjkCharCount > 0 && syllables.length === cjkCharCount;

    if (!canAlign) {
      return (
        <div className="space-y-1">
          {romanisation && (
            <p className="text-base font-medium tracking-wide text-muted-foreground">
              {romanisation}
            </p>
          )}
          <p className="text-2xl font-medium text-foreground leading-relaxed">
            {text}
          </p>
        </div>
      );
    }

    let syllableIdx = 0;
    const nodes: React.ReactNode[] = [];
    Array.from(text).forEach((char, i) => {
      if (CJK_REGEX.test(char)) {
        nodes.push(
          <ruby key={i} className="ruby-aligned">
            {char}
            <rp>(</rp>
            <rt className="text-sm font-medium tracking-wide text-muted-foreground">
              {syllables[syllableIdx++]}
            </rt>
            <rp>)</rp>
          </ruby>
        );
      } else {
        // Non-CJK (punctuation, English) — still wrap in ruby with empty rt so
        // baseline stays consistent across the line.
        nodes.push(
          <ruby key={i} className="ruby-aligned">
            {char}
            <rt className="text-sm">&nbsp;</rt>
          </ruby>
        );
      }
    });

    return (
      <p className="text-2xl font-medium text-foreground leading-[2.4]">
        {nodes}
      </p>
    );
  }, [text, romanisation]);

  return rendered;
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
  disabled,
}: {
  label: string;
  text: string;
  romanisation: string;
  labelColor: string;
  onPlay: () => void;
  isPlaying: boolean;
  disabled: boolean;
}) {
  const displayRomanisation = useMemo(() => {
    if (romanisation) return romanisation;
    if (!text) return "";
    const lang = label === "Cantonese" ? "cantonese" : "mandarin";
    return smartRomanise(text, lang);
  }, [romanisation, text, label]);

  return (
    <div className="flex-1 p-4 space-y-2">
      <span className={cn("text-[10px] uppercase tracking-wider font-bold", labelColor)}>
        {label}
      </span>
      <RubyLine text={text} romanisation={displayRomanisation} />
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
          isPlaying
            ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
            : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border",
          disabled && !isPlaying && "opacity-50 cursor-not-allowed"
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
  const uploadedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Any audio activity in progress — used to lock all play buttons
  const ttsBusy = ttsLoading || ttsPlaying || playingLineKey !== null;

  const stopAllAudio = useCallback(() => {
    stopTTS();
    if (uploadedAudioRef.current) {
      uploadedAudioRef.current.pause();
      uploadedAudioRef.current.onended = null;
      uploadedAudioRef.current.onerror = null;
      uploadedAudioRef.current = null;
    }
  }, [stopTTS]);

  const playUploaded = useCallback(
    (lineId: string, lang: "cantonese" | "mandarin") =>
      new Promise<void>((resolve) => {
        const url = `/api/accelerator/scripts/stream/${lineId}?field=${lang}`;
        const audio = new Audio(url);
        uploadedAudioRef.current = audio;
        const finish = () => {
          if (uploadedAudioRef.current === audio) {
            uploadedAudioRef.current = null;
          }
          resolve();
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      }),
    [],
  );

  // Play all state
  const [playingAllLang, setPlayingAllLang] = useState<"cantonese" | "mandarin" | null>(null);
  const [playingAllIndex, setPlayingAllIndex] = useState(-1);
  const playAllAbortRef = useRef(false);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Auto-scroll to currently playing line
  useEffect(() => {
    if (playingAllIndex >= 0) {
      const el = lineRefs.current.get(playingAllIndex);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingAllIndex]);

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
    async (line: LineData, lang: "cantonese" | "mandarin") => {
      const key = `${line.id}-${lang}`;
      const uploadedUrl =
        lang === "cantonese" ? line.cantoneseAudioUrl : line.mandarinAudioUrl;

      stopAllAudio();
      setPlayingLineKey(key);
      try {
        if (uploadedUrl) {
          await playUploaded(line.id, lang);
        } else {
          const text = lang === "cantonese" ? line.cantoneseText : line.mandarinText;
          await speak(text, { language: lang === "cantonese" ? "zh-HK" : "zh-CN" });
        }
      } finally {
        setPlayingLineKey(null);
      }
    },
    [speak, stopAllAudio, playUploaded]
  );

  // Play all for a language
  const handlePlayAll = useCallback(
    async (lang: "cantonese" | "mandarin") => {
      if (playingAllLang === lang) {
        playAllAbortRef.current = true;
        stopAllAudio();
        setPlayingAllLang(null);
        setPlayingAllIndex(-1);
        return;
      }

      stopAllAudio();
      setPlayingAllLang(lang);
      playAllAbortRef.current = false;

      const ttsLang = lang === "cantonese" ? "zh-HK" : "zh-CN";

      for (let i = 0; i < lines.length; i++) {
        if (playAllAbortRef.current) break;
        setPlayingAllIndex(i);
        const line = lines[i];
        const uploadedUrl =
          lang === "cantonese" ? line.cantoneseAudioUrl : line.mandarinAudioUrl;

        // 15s safety timeout prevents hanging on provider errors
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 15000);
          const done = () => {
            clearTimeout(timeout);
            setTimeout(resolve, 600); // pacing between lines
          };
          const play = uploadedUrl
            ? playUploaded(line.id, lang)
            : speak(lang === "cantonese" ? line.cantoneseText : line.mandarinText, {
                language: ttsLang,
              });
          play.then(done).catch(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      setPlayingAllLang(null);
      setPlayingAllIndex(-1);
    },
    [playingAllLang, lines, speak, stopAllAudio, playUploaded]
  );

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
          disabled={playingAllLang !== "cantonese" && ttsBusy}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
            playingAllLang === "cantonese"
              ? "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              : "border-border bg-card text-foreground hover:bg-accent",
            playingAllLang !== "cantonese" && ttsBusy && "opacity-50 cursor-not-allowed"
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
          disabled={playingAllLang !== "mandarin" && ttsBusy}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
            playingAllLang === "mandarin"
              ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-border bg-card text-foreground hover:bg-accent",
            playingAllLang !== "mandarin" && ttsBusy && "opacity-50 cursor-not-allowed"
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

      {/* Conversation lines — chat-style alignment */}
      <div className="space-y-5">
        {lines.map((line, idx) => {
          const isSpeaker = line.role === "speaker";
          const roleName = isSpeaker ? script.speakerRole : script.responderRole;
          const lineRating = ratings.get(line.id);
          const isLineSaving = saving === line.id;
          const isCantoHighlighted = playingAllLang === "cantonese" && playingAllIndex === idx;
          const isMandoHighlighted = playingAllLang === "mandarin" && playingAllIndex === idx;

          return (
            <div
              key={line.id}
              ref={(el) => { if (el) lineRefs.current.set(idx, el); }}
              className={cn(
                "space-y-2 max-w-[92%] sm:max-w-[85%]",
                isSpeaker ? "mr-auto" : "ml-auto"
              )}
            >
              {/* Role label + English */}
              <div className={cn(
                "flex items-center gap-2 px-1",
                !isSpeaker && "justify-end"
              )}>
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
                isSpeaker ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-sky-500/30 bg-sky-500/[0.02]",
                (isCantoHighlighted || isMandoHighlighted) && "ring-2 ring-cyan-400 border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/20 transition-all"
              )}>
                <LangBubble
                  label="Cantonese"
                  text={line.cantoneseText}
                  romanisation={line.cantoneseRomanisation}
                  labelColor="text-cyan-500"
                  onPlay={() => handlePlayLine(line, "cantonese")}
                  isPlaying={playingLineKey === `${line.id}-cantonese`}
                  disabled={ttsBusy && playingLineKey !== `${line.id}-cantonese`}
                />
                <LangBubble
                  label="Mandarin"
                  text={line.mandarinText}
                  romanisation={line.mandarinRomanisation}
                  labelColor="text-red-500"
                  onPlay={() => handlePlayLine(line, "mandarin")}
                  isPlaying={playingLineKey === `${line.id}-mandarin`}
                  disabled={ttsBusy && playingLineKey !== `${line.id}-mandarin`}
                />
              </div>

              {/* Self-check */}
              <div className={cn(
                "flex items-center gap-3 px-1",
                !isSpeaker && "justify-end"
              )}>
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
      {/* Uses sticky instead of fixed because <main> has overflow-auto creating its own scroll context */}
      <div className="sticky bottom-0 z-40 -mx-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
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
