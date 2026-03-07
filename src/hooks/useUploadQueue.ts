"use client";

import { useState, useCallback, useRef } from "react";
import * as UpChunk from "@mux/upchunk";

export interface UploadItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "processing" | "complete" | "error";
  progress: number;
  error?: string;
  muxUploadId?: string;
}

interface UseUploadQueueOptions {
  maxConcurrent?: number;
  onUploadComplete?: (item: UploadItem) => void;
  onQueueComplete?: () => void;
}

/**
 * Hook for managing a rate-limited upload queue.
 * Uses @mux/upchunk for chunked browser uploads (handles CORS properly).
 */
export function useUploadQueue(options: UseUploadQueueOptions = {}) {
  const { maxConcurrent = 5, onUploadComplete, onQueueComplete } = options;

  const [items, setItems] = useState<UploadItem[]>([]);
  const activeUploadsRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);

  // Update item in state
  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  // Process next item in queue
  const processNext = useCallback(async () => {
    if (activeUploadsRef.current >= maxConcurrent) return;
    if (queueRef.current.length === 0) {
      if (activeUploadsRef.current === 0) {
        onQueueComplete?.();
      }
      return;
    }

    const item = queueRef.current.shift()!;
    activeUploadsRef.current++;

    updateItem(item.id, { status: "uploading", progress: 0 });

    try {
      // 1. Get upload URL from our API
      const urlRes = await fetch("/api/admin/mux/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.file.name }),
      });

      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, uploadId } = await urlRes.json();

      updateItem(item.id, { muxUploadId: uploadId });

      // 2. Upload file via UpChunk (chunked, handles CORS)
      await new Promise<void>((resolve, reject) => {
        const upload = UpChunk.createUpload({
          endpoint: uploadUrl,
          file: item.file,
          chunkSize: 5120, // 5MB chunks
        });

        upload.on("progress", (detail: { detail: number }) => {
          updateItem(item.id, { progress: Math.round(detail.detail) });
        });

        upload.on("success", () => resolve());
        upload.on("error", (err: { detail: { message: string } }) => {
          reject(new Error(err.detail.message || "Upload failed"));
        });
      });

      // 3. Poll Mux for asset readiness (webhooks can't reach localhost)
      updateItem(item.id, { status: "processing", progress: 100 });

      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const statusRes = await fetch("/api/admin/mux/check-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId }),
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "ready") {
              ready = true;
              break;
            }
            if (statusData.status === "errored") {
              throw new Error(statusData.errorMessage || "Processing failed");
            }
          }
        } catch {
          // Keep polling on network errors
        }
      }

      updateItem(item.id, { status: ready ? "complete" : "processing", progress: 100 });
      onUploadComplete?.({ ...item, status: ready ? "complete" : "processing", progress: 100 });
    } catch (error) {
      updateItem(item.id, {
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      activeUploadsRef.current--;
      processNext();
    }
  }, [maxConcurrent, updateItem, onUploadComplete, onQueueComplete]);

  // Add files to queue
  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "queued" as const,
        progress: 0,
      }));

      setItems((prev) => [...prev, ...newItems]);
      queueRef.current.push(...newItems);

      // Start processing
      for (let i = 0; i < Math.min(newItems.length, maxConcurrent); i++) {
        processNext();
      }
    },
    [maxConcurrent, processNext]
  );

  // Remove item from list
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    queueRef.current = queueRef.current.filter((item) => item.id !== id);
  }, []);

  // Clear completed/errored items
  const clearCompleted = useCallback(() => {
    setItems((prev) =>
      prev.filter((item) => item.status !== "complete" && item.status !== "error")
    );
  }, []);

  return {
    items,
    addFiles,
    removeItem,
    clearCompleted,
    isUploading: items.some((item) => item.status === "uploading"),
    hasQueued: items.some((item) => item.status === "queued"),
  };
}
