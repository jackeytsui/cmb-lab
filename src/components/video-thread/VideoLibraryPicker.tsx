"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Video } from "lucide-react";

interface VideoUpload {
  id: string;
  muxPlaybackId: string | null;
  filename: string;
  durationSeconds: number | null;
  createdAt: string;
}

interface VideoLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (upload: { id: string; muxPlaybackId: string; filename: string }) => void;
}

export function VideoLibraryPicker({ open, onOpenChange, onSelect }: VideoLibraryPickerProps) {
  const [uploads, setUploads] = useState<VideoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);

    fetch("/api/admin/uploads?status=ready")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch uploads");
        return res.json();
      })
      .then((data) => {
        setUploads(data.uploads || []);
      })
      .catch((err) => {
        console.error("Failed to load video library:", err);
        setError("Failed to load videos. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  const handleSelect = (upload: VideoUpload) => {
    if (!upload.muxPlaybackId) return;
    onSelect({
      id: upload.id,
      muxPlaybackId: upload.muxPlaybackId,
      filename: upload.filename,
    });
    onOpenChange(false);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Choose from Library</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="space-y-2">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && uploads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Video className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No ready videos found</p>
              <p className="text-xs mt-1">Upload a video first, then come back to select it.</p>
            </div>
          )}

          {/* Video grid */}
          {!loading && !error && uploads.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4">
              {uploads
                .filter((u) => !!u.muxPlaybackId)
                .map((upload) => (
                  <button
                    key={upload.id}
                    onClick={() => handleSelect(upload)}
                    className="group text-left rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-indigo-400 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-gray-100 relative overflow-hidden">
                      <img
                        src={`https://image.mux.com/${upload.muxPlaybackId}/thumbnail.webp?width=320&height=180`}
                        alt={upload.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      {upload.durationSeconds && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                          {formatDuration(upload.durationSeconds)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {upload.filename}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(upload.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
