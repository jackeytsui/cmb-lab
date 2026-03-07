"use client";

import { useState, useCallback } from "react";
import { VideoUploadZone } from "@/components/admin/VideoUploadZone";
import { VideoLibrary } from "@/components/admin/VideoLibrary";
import { BatchAssignModal } from "@/components/admin/BatchAssignModal";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import type { UploadItem } from "@/hooks/useUploadQueue";
import type { VideoUpload } from "@/db/schema/uploads";

type Tab = "upload" | "library";

export function ContentManagementClient() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleQueueComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const { items, addFiles, removeItem, clearCompleted, isUploading } =
    useUploadQueue({
      onQueueComplete: handleQueueComplete,
    });

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      addFiles(files);
    },
    [addFiles]
  );

  const handleAssignSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-zinc-800 pb-4">
        <button
          onClick={() => setActiveTab("upload")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "upload"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
          }`}
        >
          Upload Videos
        </button>
        <button
          onClick={() => setActiveTab("library")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "library"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
          }`}
        >
          Video Library
        </button>

        {/* Batch actions */}
        {activeTab === "library" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowAssignModal(true)}
              className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-sm text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            >
              Batch Assign to Lessons
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Upload Videos
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              Drag and drop video files or click to browse. Files are uploaded
              directly to Mux for processing.
            </p>
            <VideoUploadZone
              onFilesSelected={handleFilesSelected}
              disabled={isUploading}
            />
          </div>

          {/* Upload progress list */}
          {items.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">
                  Upload Progress
                </h3>
                <button
                  onClick={clearCompleted}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Clear completed
                </button>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <UploadProgressRow
                    key={item.id}
                    item={item}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="text-lg font-medium text-white mb-2">
              Upload Guidelines
            </h3>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>Supported formats: MP4, MOV, WebM, and most video formats</li>
              <li>Maximum 5 files upload concurrently to avoid rate limits</li>
              <li>Videos are processed by Mux (may take a few minutes)</li>
              <li>After processing, assign videos to lessons from the library</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "library" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <VideoLibrary key={refreshKey} />
          </div>
        </div>
      )}

      {/* Batch assign modal */}
      <BatchAssignModalWrapper
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        onSuccess={handleAssignSuccess}
      />
    </>
  );
}

function UploadProgressRow({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
}) {
  const statusColors: Record<string, string> = {
    queued: "text-zinc-400",
    uploading: "text-blue-400",
    processing: "text-yellow-400",
    complete: "text-green-400",
    error: "text-red-400",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-200">
          {item.file.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className={`text-xs font-medium ${statusColors[item.status]}`}>
            {item.status === "uploading"
              ? `Uploading ${item.progress}%`
              : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </span>
          {item.error && (
            <span className="text-xs text-red-400">{item.error}</span>
          )}
        </div>
        {item.status === "uploading" && (
          <div className="mt-2 h-1 w-full rounded-full bg-zinc-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>
      {(item.status === "complete" || item.status === "error") && (
        <button
          onClick={() => onRemove(item.id)}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Remove
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper that fetches ready/unassigned videos for the batch assign modal.
 */
function BatchAssignModalWrapper({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [videos, setVideos] = useState<VideoUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch videos when modal opens
  if (open && videos.length === 0 && !loading && !fetchError) {
    setLoading(true);
    setFetchError(null);
    fetch("/api/admin/uploads?status=ready&unassigned=true")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch videos");
        }
        return res.json();
      })
      .then((data) => {
        setVideos(data.uploads || []);
      })
      .catch((err) => {
        console.error("Failed to fetch videos for batch assign:", err);
        setFetchError("Failed to load available videos. Please try again.");
      })
      .finally(() => setLoading(false));
  }

  // Reset when closed
  if (!open && (videos.length > 0 || fetchError)) {
    setVideos([]);
    setFetchError(null);
  }

  if (!open) return null;

  if (fetchError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <ErrorAlert
            message={fetchError}
            onRetry={() => {
              setFetchError(null);
              setVideos([]);
            }}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => onOpenChange(false)}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BatchAssignModal
      open={open}
      onOpenChange={onOpenChange}
      selectedVideos={videos}
      onSuccess={onSuccess}
    />
  );
}
