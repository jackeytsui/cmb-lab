"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { CheckCircle, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

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

type ClipGroup = {
  groupNumber: number;
  clips: Clip[];
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

  const groups = useMemo<ClipGroup[]>(() => {
    const map = new Map<number, Clip[]>();
    for (const clip of clips) {
      const list = map.get(clip.groupNumber) ?? [];
      list.push(clip);
      map.set(clip.groupNumber, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNumber, groupClips]) => ({ groupNumber, clips: groupClips }));
  }, [clips]);

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
      {/* Hero video */}
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
      ) : null}

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

      {/* Clip groups */}
      {groups.map((group) => (
        <div key={group.groupNumber} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Group {group.groupNumber}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.clips.map((clip) => {
              const rating = ratings[clip.id];
              const isSaving = savingClipId === clip.id;
              const isPlayingThis = playingClipId === clip.id;

              return (
                <div
                  key={clip.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Video */}
                  <div className="relative aspect-[9/16] max-h-[280px] bg-black">
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
                        className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/80 hover:text-white transition-colors"
                      >
                        <Play className="w-10 h-10" />
                        <span className="text-2xl font-bold">{clip.chinese}</span>
                        <span className="text-sm">{clip.pinyin}</span>
                      </button>
                    )}
                  </div>

                  {/* Info + rating */}
                  <div className="p-3 space-y-2">
                    <div className="text-center">
                      <span className="text-sm font-medium text-foreground">
                        {clip.title}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {clip.groupNumber}-{clip.itemNumber}{clip.variant}
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
        </div>
      ))}
    </div>
  );
}
