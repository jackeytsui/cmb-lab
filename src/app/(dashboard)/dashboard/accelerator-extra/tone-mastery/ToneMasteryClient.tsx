"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { pinyin } from "pinyin-pro";
import { getToneColorClass } from "@/lib/tone-colors";

type Clip = {
  id: string;
  title: string;
  pinyin: string;
  chinese: string;
  videoUrl: string;
  groupNumber: number;
  itemNumber: number;
  variant: string;
  sortOrder: number;
};

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.pathname.includes("/embed/")) return url;
    return null;
  } catch {
    return null;
  }
}

/** Render Chinese characters with tone-colored styling and pinyin above */
function ToneColoredChars({ chinese }: { chinese: string }) {
  const chars = [...chinese];
  const pinyinArray = pinyin(chinese, { toneType: "symbol", type: "array" });
  const toneNumbers = pinyin(chinese, { pattern: "num", type: "array" }).map(Number);

  return (
    <span className="inline-flex items-end gap-[1px]">
      {chars.map((char, i) => {
        const isChinese = /\p{Script=Han}/u.test(char);
        const tone = toneNumbers[i] ?? 0;
        const colorClass = isChinese ? getToneColorClass(tone, "mandarin") : "";
        const py = isChinese ? pinyinArray[i] : "";
        return (
          <span key={i} className="inline-flex flex-col items-center">
            {py && (
              <span className="text-[10px] text-muted-foreground leading-tight">
                {py}
              </span>
            )}
            <span className={cn("text-base font-medium", colorClass)}>
              {char}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ToneMasteryClient() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [heroVideoUrl, setHeroVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingClipId, setSavingClipId] = useState<string | null>(null);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accelerator-extra/tone-mastery")
      .then((r) => r.json())
      .then((data) => {
        setClips(data.clips ?? []);
        setRatings(data.ratings ?? {});
        setHeroVideoUrl(data.heroVideoUrl ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ratedCount = Object.keys(ratings).length;
  const totalCount = clips.length;
  const progressPct = totalCount > 0 ? Math.round((ratedCount / totalCount) * 100) : 0;

  const handleRate = useCallback(
    async (clipId: string, selfRating: "good" | "not_good") => {
      setSavingClipId(clipId);
      try {
        const res = await fetch("/api/accelerator-extra/tone-mastery/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clipId, selfRating }),
        });
        if (res.ok) {
          setRatings((prev) => ({ ...prev, [clipId]: selfRating }));
        }
      } catch {
        // ignore
      } finally {
        setSavingClipId(null);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const heroEmbed = heroVideoUrl ? toYouTubeEmbed(heroVideoUrl) : null;

  return (
    <div className="space-y-8">
      {/* Hero / intro video */}
      {heroEmbed ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-black">
          <iframe
            src={heroEmbed}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Tone Mastery Introduction"
          />
        </div>
      ) : heroVideoUrl ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-black">
          <video src={heroVideoUrl} className="w-full h-full" controls playsInline preload="metadata">
            Your browser does not support the video tag.
          </video>
        </div>
      ) : (
        <div className="aspect-video w-full rounded-xl border border-dashed border-border bg-muted/30 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Introduction video — coming soon
          </p>
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{ratedCount}/{totalCount} clips rated</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* No clips yet */}
      {totalCount === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Tone mastery clips will be available soon.
          </p>
        </div>
      )}

      {/* All clips — flat grid, no grouping */}
      {totalCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => {
            const rating = ratings[clip.id];
            const isSaving = savingClipId === clip.id;
            const isPlayingThis = playingClipId === clip.id;

            return (
              <div
                key={clip.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Video area */}
                <div className="relative aspect-square bg-black">
                  {isPlayingThis ? (
                    <video
                      src={clip.videoUrl}
                      className="w-full h-full object-contain"
                      controls
                      autoPlay
                      playsInline
                      onEnded={() => setPlayingClipId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlayingClipId(clip.id)}
                      className="w-full h-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                    >
                      <Play className="w-12 h-12" />
                    </button>
                  )}
                </div>

                {/* Tone-colored Chinese + pinyin + English + rating */}
                <div className="p-3 space-y-2">
                  <div className="flex flex-col items-center gap-1">
                    <ToneColoredChars chinese={clip.chinese} />
                    <span className="text-xs text-muted-foreground italic">
                      {clip.title}
                    </span>
                  </div>

                  {/* Self-rating */}
                  {rating ? (
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
                          rating === "good"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <CheckCircle className="w-3 h-3" />
                        {rating === "good" ? "Good" : "Not so great"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRate(clip.id, "good")}
                        disabled={isSaving}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        Good
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRate(clip.id, "not_good")}
                        disabled={isSaving}
                        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        Not so great
                      </button>
                    </div>
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
