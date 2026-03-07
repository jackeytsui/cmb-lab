"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";

interface VideoUploadRecord {
  id: string;
  muxUploadId: string;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  filename: string;
  status: "pending" | "uploading" | "processing" | "ready" | "errored";
  category: "lesson" | "prompt" | "other";
  tags: string[] | null;
  errorMessage: string | null;
  durationSeconds: number | null;
  lessonId: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "all" | "ready" | "processing" | "errored";
type CategoryFilter = "all" | "lesson" | "prompt" | "other";

/**
 * Video library showing all uploaded videos with their status.
 * Fetches from /api/admin/uploads and supports status filtering.
 */
export function VideoLibrary() {
  const [uploads, setUploads] = useState<VideoUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const fetchUploads = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      
      const res = await fetch(`/api/admin/uploads?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch uploads");
      }
      const data = await res.json();
      setUploads(data.uploads);
    } catch (err) {
      console.error("Failed to fetch uploads:", err);
      setError("Failed to load video library. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    setLoading(true);
    fetchUploads();
  }, [fetchUploads]);

  const statusCounts = uploads.reduce(
    (acc, u) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Header with filter tabs */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Video Library</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchUploads}
          className="h-7 text-xs text-zinc-400 hover:text-white"
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter */}
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "ready", label: "Ready" },
              { key: "processing", label: "Processing" },
              { key: "errored", label: "Errors" },
            ] as { key: StatusFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
          {(
            [
              { key: "all", label: "All Types" },
              { key: "lesson", label: "Lessons" },
              { key: "prompt", label: "Prompts" },
              { key: "other", label: "Other" },
            ] as { key: CategoryFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategoryFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === tab.key
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <ErrorAlert message={error} onRetry={fetchUploads} />
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <Skeleton
              key={n}
              className="h-16 w-full rounded-lg bg-zinc-700/50"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && uploads.length === 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-8 text-center">
          <p className="text-zinc-400">
            {statusFilter === "all" && categoryFilter === "all"
              ? "No videos uploaded yet. Use the upload zone above to get started."
              : `No matching videos found.`}
          </p>
        </div>
      )}

      {/* Video list */}
      {!loading && !error && uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <VideoRow key={upload.id} upload={upload} />
          ))}
        </div>
      )}

      {/* Summary counts */}
      {!loading && !error && uploads.length > 0 && (
        <p className="text-xs text-zinc-500">
          {uploads.length} video{uploads.length !== 1 ? "s" : ""}
          {statusCounts.ready ? ` | ${statusCounts.ready} ready` : ""}
          {statusCounts.processing
            ? ` | ${statusCounts.processing} processing`
            : ""}
          {statusCounts.errored ? ` | ${statusCounts.errored} errored` : ""}
        </p>
      )}
    </div>
  );
}

function VideoRow({ upload }: { upload: VideoUploadRecord }) {
  const statusConfig = getVideoStatusConfig(upload.status);
  
  const categoryColors: Record<string, string> = {
    lesson: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    prompt: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    other: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
      {/* Thumbnail placeholder / status icon */}
      <div
        className={`flex h-10 w-14 shrink-0 items-center justify-center rounded ${statusConfig.bgClass}`}
      >
        {upload.status === "ready" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-green-400"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : upload.status === "processing" ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-yellow-400" />
        ) : upload.status === "errored" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-200">
            {upload.filename}
          </p>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                categoryColors[upload.category] || categoryColors.other
            }`}
          >
            {upload.category.toUpperCase()}
          </span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${statusConfig.badgeClass}`}
          >
            {statusConfig.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
          {upload.durationSeconds && (
            <span>{formatDuration(upload.durationSeconds)}</span>
          )}
          <span>{formatDate(upload.createdAt)}</span>
          {upload.lessonId && (
            <span className="text-indigo-400">Assigned to lesson</span>
          )}
          {upload.tags && upload.tags.length > 0 && (
            <span className="flex gap-1">
                {upload.tags.map(tag => (
                    <span key={tag} className="text-zinc-400 bg-zinc-700/50 px-1 rounded">#{tag}</span>
                ))}
            </span>
          )}
        </div>
        {upload.errorMessage && (
          <p className="mt-1 text-xs text-red-400">{upload.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function getVideoStatusConfig(
  status: VideoUploadRecord["status"]
) {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        badgeClass: "bg-zinc-700 text-zinc-300",
        bgClass: "bg-zinc-700/50",
      };
    case "uploading":
      return {
        label: "Uploading",
        badgeClass: "bg-indigo-900/50 text-indigo-300",
        bgClass: "bg-indigo-900/30",
      };
    case "processing":
      return {
        label: "Processing",
        badgeClass: "bg-yellow-900/50 text-yellow-300",
        bgClass: "bg-yellow-900/30",
      };
    case "ready":
      return {
        label: "Ready",
        badgeClass: "bg-green-900/50 text-green-300",
        bgClass: "bg-green-900/30",
      };
    case "errored":
      return {
        label: "Failed",
        badgeClass: "bg-red-900/50 text-red-300",
        bgClass: "bg-red-900/30",
      };
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
