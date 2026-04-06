"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Upload, Loader2, Check, ExternalLink, Video, X, Pencil } from "lucide-react";

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
  {
    id: "typing_unlock_kit",
    title: "Typing Unlock Kit",
    videoKey: "accelerator.typing_unlock_kit.video_url",
    pdfKey: "accelerator.typing_unlock_kit.pdf_url",
  },
];

/**
 * Upload a file via @vercel/blob/client.
 * Uses /api/blob-proxy to avoid CORS issues with custom domains.
 * The NEXT_PUBLIC_VERCEL_BLOB_API_URL env var redirects the SDK to our proxy.
 */
async function uploadFile(file: File): Promise<string> {
  const blob = await upload(file.name, file, {
    access: "private",
    contentType: file.type || "application/octet-stream",
    handleUploadUrl: "/api/admin/accelerator/settings/upload",
    multipart: true,
  });
  return blob.url;
}

function ContentSection({
  config,
  settings,
  onUpdate,
}: {
  config: SectionConfig;
  settings: Record<string, string>;
  onUpdate: () => void;
}) {
  const savedVideoUrl = settings[config.videoKey] ?? "";
  const [videoUrl, setVideoUrl] = useState(savedVideoUrl);
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);
  const [removingVideo, setRemovingVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [editing, setEditing] = useState(!savedVideoUrl);

  const currentPdf = settings[config.pdfKey] ?? "";

  // Sync local state when settings change externally
  useEffect(() => {
    setVideoUrl(settings[config.videoKey] ?? "");
    setEditing(!(settings[config.videoKey] ?? ""));
  }, [settings, config.videoKey]);

  const handleSaveVideo = async () => {
    setSavingVideo(true);
    try {
      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.videoKey, value: videoUrl }),
      });
      setVideoSaved(true);
      setEditing(false);
      setTimeout(() => setVideoSaved(false), 2000);
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingVideo(false);
    }
  };

  const handleRemoveVideo = async () => {
    setRemovingVideo(true);
    try {
      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.videoKey, value: "" }),
      });
      setVideoUrl("");
      setEditing(true);
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setRemovingVideo(false);
    }
  };

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);

      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.pdfKey, value: url }),
      });
      onUpdate();
    } catch (err) {
      console.error("PDF upload failed:", err);
      alert(`PDF upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
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
      const url = await uploadFile(file);

      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.videoKey, value: url }),
      });
      setVideoUrl(url);
      onUpdate();
    } catch (err) {
      console.error("Video upload failed:", err);
      alert(`Video upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
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
        {savedVideoUrl && !editing ? (
          /* Saved state — grayed out URL with Edit / Remove buttons */
          <div className="flex items-center gap-2">
            <Input
              value={videoUrl}
              readOnly
              className="flex-1 bg-muted text-muted-foreground cursor-default"
            />
            <Button
              onClick={() => setEditing(true)}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              onClick={handleRemoveVideo}
              disabled={removingVideo}
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              {removingVideo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Remove
            </Button>
          </div>
        ) : (
          /* Editing state — input + Save + Upload */
          <div className="flex gap-2">
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or paste a video URL"
              className="flex-1"
            />
            <Button
              onClick={handleSaveVideo}
              disabled={savingVideo || !videoUrl.trim()}
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
        )}
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
