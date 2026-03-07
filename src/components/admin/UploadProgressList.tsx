"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadItem } from "@/hooks/useUploadQueue";

interface UploadProgressListProps {
  /** List of upload items from the queue */
  items: UploadItem[];
  /** Remove a specific item from the list */
  onRemove: (id: string) => void;
  /** Clear all completed and errored items */
  onClearCompleted: () => void;
}

/**
 * Displays individual progress for each uploading video.
 * Shows status badges, progress bars, and file info.
 */
export function UploadProgressList({
  items,
  onRemove,
  onClearCompleted,
}: UploadProgressListProps) {
  if (items.length === 0) return null;

  const hasCompleted = items.some(
    (item) => item.status === "complete" || item.status === "error"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">
          Uploads ({items.length})
        </h3>
        {hasCompleted && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCompleted}
            className="h-7 text-xs text-zinc-400 hover:text-white"
          >
            Clear finished
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <UploadProgressItem key={item.id} item={item} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function UploadProgressItem({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
}) {
  const statusConfig = getStatusConfig(item.status);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
      {/* File icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
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
      </div>

      {/* File info and progress */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm text-zinc-200">{item.file.name}</p>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Progress bar for uploading state */}
        {item.status === "uploading" && (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={item.progress} className="h-1.5 flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              {item.progress}%
            </span>
          </div>
        )}

        {/* Processing spinner */}
        {item.status === "processing" && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-indigo-400" />
            <span className="text-xs text-zinc-400">
              Processing on Mux...
            </span>
          </div>
        )}

        {/* Error message */}
        {item.status === "error" && item.error && (
          <p className="mt-1 text-xs text-red-400">{item.error}</p>
        )}

        {/* File size */}
        <p className="mt-0.5 text-xs text-zinc-500">
          {formatFileSize(item.file.size)}
        </p>
      </div>

      {/* Remove button (only for non-active uploads) */}
      {(item.status === "queued" ||
        item.status === "complete" ||
        item.status === "error") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.id)}
          className="h-7 w-7 shrink-0 p-0 text-zinc-500 hover:text-red-400"
          title="Remove"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      )}
    </div>
  );
}

function getStatusConfig(status: UploadItem["status"]) {
  switch (status) {
    case "queued":
      return { label: "Queued", className: "bg-zinc-700 text-zinc-300" };
    case "uploading":
      return { label: "Uploading", className: "bg-indigo-900/50 text-indigo-300" };
    case "processing":
      return { label: "Processing", className: "bg-yellow-900/50 text-yellow-300" };
    case "complete":
      return { label: "Ready", className: "bg-green-900/50 text-green-300" };
    case "error":
      return { label: "Failed", className: "bg-red-900/50 text-red-300" };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
