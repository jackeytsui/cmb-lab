"use client";

import { upload } from "@vercel/blob/client";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CirclePlay,
  Loader2,
  Replace,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadStage = "idle" | "uploading" | "saving" | "removing";

const WALKTHROUGH_API = "/api/admin/audio-course/walkthrough";
const UPLOAD_API = `${WALKTHROUGH_API}/upload`;
const STREAM_API = "/api/audio-courses/walkthrough";
const ACCEPTED_EXTENSIONS = /\.(mp4|mov|m4v|webm)$/i;

function safeFilename(filename: string): string {
  const normalized = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "walkthrough.mp4";
}

function streamUrl(videoUrl: string): string {
  const version = videoUrl.split("/").filter(Boolean).pop() ?? "current";
  return `${STREAM_API}?v=${encodeURIComponent(version)}`;
}

export function AudioCourseWalkthroughAdmin() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(WALKTHROUGH_API)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not load the walkthrough video");
        }
        if (!cancelled) setVideoUrl(data.videoUrl ?? null);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "Could not load the walkthrough video",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const uploadVideo = async (file: File) => {
    if (!file.type.startsWith("video/") && !ACCEPTED_EXTENSIONS.test(file.name)) {
      setMessage({
        kind: "error",
        text: "Please choose an MP4, MOV, M4V, or WebM video.",
      });
      return;
    }

    setMessage(null);
    setProgress(0);
    setStage("uploading");

    try {
      const blob = await upload(
        `audio-course-walkthrough/${Date.now()}-${safeFilename(file.name)}`,
        file,
        {
          access: "private",
          contentType: file.type || "video/mp4",
          handleUploadUrl: UPLOAD_API,
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => {
            setProgress(Math.round(percentage));
          },
        },
      );

      setStage("saving");
      const saveResponse = await fetch(WALKTHROUGH_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: blob.url }),
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Could not publish the walkthrough");
      }

      setVideoUrl(blob.url);
      setMessage({
        kind: "success",
        text: "Walkthrough published. Students can now open it from Audio Courses.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not upload the walkthrough video",
      });
    } finally {
      setStage("idle");
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadVideo(file);
  };

  const removeWalkthrough = async () => {
    const confirmed = window.confirm(
      "Remove the walkthrough from Audio Courses and delete its stored video?",
    );
    if (!confirmed) return;

    setMessage(null);
    setStage("removing");
    try {
      const response = await fetch(WALKTHROUGH_API, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not remove the walkthrough");
      }
      setVideoUrl(null);
      setMessage({ kind: "success", text: "Walkthrough video removed." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not remove the walkthrough",
      });
    } finally {
      setStage("idle");
    }
  };

  const isBusy = stage !== "idle";
  const busyLabel =
    stage === "uploading"
      ? `Uploading ${progress}%`
      : stage === "saving"
        ? "Publishing…"
        : stage === "removing"
          ? "Removing…"
          : null;

  return (
    <section className="rounded-xl border border-primary/20 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <CirclePlay className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Student walkthrough video
            </h2>
            {videoUrl && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Live
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Upload the quick guide shown beside the student Audio Courses list.
            The private video opens only after a student clicks the quick-tour
            button.
          </p>

          {message && (
            <div
              role={message.kind === "error" ? "alert" : "status"}
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                message.kind === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-500"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm"
            aria-label="Upload Audio Courses walkthrough video"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || isLoading}
            >
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : videoUrl ? (
                <Replace className="mr-2 h-4 w-4" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {busyLabel ?? (videoUrl ? "Replace video" : "Upload video")}
            </Button>
            {videoUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void removeWalkthrough()}
                disabled={isBusy}
                className="text-red-500 hover:text-red-500"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          {isLoading ? (
            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted/50">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : videoUrl ? (
            <div className="aspect-video overflow-hidden rounded-lg bg-black shadow-sm">
              <video
                key={videoUrl}
                src={streamUrl(videoUrl)}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
              <CirclePlay className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">
                No walkthrough is visible to students yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
