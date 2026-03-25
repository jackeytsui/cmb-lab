"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContentPageClientProps {
  title: string;
  description: string;
  videoKey: string;
  pdfKey: string;
}

export function ContentPageClient({
  title,
  description,
  videoKey,
  pdfKey,
}: ContentPageClientProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Extract YouTube embed URL
  const embedUrl = videoUrl ? toYouTubeEmbed(videoUrl) : null;

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
    // Fallback: treat as direct embed
    return url;
  } catch {
    return null;
  }
}
