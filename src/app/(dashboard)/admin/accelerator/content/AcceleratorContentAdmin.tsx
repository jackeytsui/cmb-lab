"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Upload, Loader2, Check, ExternalLink, Video } from "lucide-react";

type SectionConfig = {
  id: string;
  title: string;
  videoKey: string;
  pdfKey: string;
};

const SECTIONS: SectionConfig[] = [
  {
    id: "practice_plan",
    title: "Practice Plan",
    videoKey: "accelerator.practice_plan.video_url",
    pdfKey: "accelerator.practice_plan.pdf_url",
  },
  {
    id: "starter_pack",
    title: "Starter Pack",
    videoKey: "accelerator.starter_pack.video_url",
    pdfKey: "accelerator.starter_pack.pdf_url",
  },
];

function ContentSection({
  config,
  settings,
  onUpdate,
}: {
  config: SectionConfig;
  settings: Record<string, string>;
  onUpdate: () => void;
}) {
  const [videoUrl, setVideoUrl] = useState(settings[config.videoKey] ?? "");
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const currentPdf = settings[config.pdfKey] ?? "";

  const handleSaveVideo = async () => {
    setSavingVideo(true);
    try {
      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.videoKey, value: videoUrl }),
      });
      setVideoSaved(true);
      setTimeout(() => setVideoSaved(false), 2000);
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingVideo(false);
    }
  };

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/accelerator/settings/upload",
      });

      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.pdfKey, value: blob.url }),
      });
      onUpdate();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("PDF upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/accelerator/settings/upload",
      });

      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.videoKey, value: blob.url }),
      });
      setVideoUrl(blob.url);
      onUpdate();
    } catch (err) {
      console.error("Video upload failed:", err);
      alert("Video upload failed. Please try again.");
    } finally {
      setUploadingVideo(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{config.title}</h3>

      {/* Video URL or Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Video (YouTube URL or upload)
        </label>
        <div className="flex gap-2">
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... or paste a video URL"
            className="flex-1"
          />
          <Button
            onClick={handleSaveVideo}
            disabled={savingVideo}
            variant="outline"
            className="gap-2"
          >
            {savingVideo ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : videoSaved ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : null}
            Save
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUploadVideo}
              disabled={uploadingVideo}
            />
            <Button
              variant="outline"
              className="gap-2 pointer-events-none"
              disabled={uploadingVideo}
            >
              {uploadingVideo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Video className="w-4 h-4" />
              )}
              {uploadingVideo ? "Uploading..." : "Upload Video"}
            </Button>
          </label>
        </div>
      </div>

      {/* PDF Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          PDF Document
        </label>
        {currentPdf ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-500" />
              <span className="text-sm text-foreground">PDF uploaded</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={currentPdf}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleUploadPdf}
                  disabled={uploading}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 pointer-events-none"
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Replace
                </Button>
              </label>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleUploadPdf}
              disabled={uploading}
            />
            <div className="flex items-center justify-center gap-3 rounded-lg border border-dashed border-border py-8 hover:bg-accent/50 transition-colors">
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload PDF
                  </span>
                </>
              )}
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

export function AcceleratorContentAdmin() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accelerator/settings");
      const data = await res.json();
      setSettings(data.settings ?? {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Manage the video and PDF content for the Practice Plan and Starter Pack
        pages. Students can view the video and download the PDF.
      </p>
      {SECTIONS.map((config) => (
        <ContentSection
          key={config.id}
          config={config}
          settings={settings}
          onUpdate={fetchSettings}
        />
      ))}
    </div>
  );
}
