"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, FileText, Loader2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContentPageClientProps {
  title: string;
  description: string;
  videoKey: string;
  pdfKey: string;
  completionKey?: string;
}

export function ContentPageClient({
  title,
  description,
  videoKey,
  pdfKey,
  completionKey,
}: ContentPageClientProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch("/api/accelerator/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? {};
        setVideoUrl(s[videoKey] || null);
        setPdfUrl(s[pdfKey] || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [videoKey, pdfKey]);

  useEffect(() => {
    if (!completionKey) return;
    fetch(`/api/accelerator/content-completion?key=${completionKey}`)
      .then((r) => r.json())
      .then((d) => setCompleted(!!d.completed))
      .catch(() => {});
  }, [completionKey]);

  const toggleComplete = useCallback(async () => {
    if (!completionKey || toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/accelerator/content-completion", {
        method: completed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: completionKey }),
      });
      if (res.ok) setCompleted(!completed);
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  }, [completionKey, completed, toggling]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine video type: YouTube embed or direct video file
  const embedUrl = videoUrl ? toYouTubeEmbed(videoUrl) : null;
  const isDirectVideo = videoUrl && !embedUrl;

  return (
    <div className="space-y-6">
      {/* Video */}
      {embedUrl ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-black">
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
          />
        </div>
      ) : isDirectVideo ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-black">
          <video
            src={videoUrl}
            className="w-full h-full"
            controls
            playsInline
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      ) : (
        <div className="aspect-video w-full rounded-xl border border-border bg-card flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Video coming soon</p>
        </div>
      )}

      {/* PDF download */}
      {pdfUrl ? (
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-500/10">
              <FileText className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-foreground">{title} PDF</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Download
            </Button>
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground">
            PDF will be available soon.
          </p>
        </div>
      )}

      {/* Mark as complete */}
      {completionKey && (
        <button
          type="button"
          onClick={toggleComplete}
          disabled={toggling}
          className={`w-full rounded-xl border p-4 flex items-center justify-center gap-2.5 text-sm font-medium transition-all ${
            completed
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-cyan-500/30"
          }`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : completed ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
          {completed ? "Completed" : "Mark as Complete"}
        </button>
      )}
    </div>
  );
}

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    // youtube.com/watch?v=XXX
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    // youtu.be/XXX
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    // Already an embed URL
    if (u.pathname.includes("/embed/")) {
      return url;
    }
    // Not a YouTube URL — return null so it falls through to direct video
    return null;
  } catch {
    return null;
  }
}
