"use client";

import { useState, useCallback, useRef, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type CaptionLine = {
  text: string;
  startMs: number;
  endMs: number;
  sequence: number;
};

interface CaptionUploadProps {
  videoSessionId: string;
  onUploadComplete: (captions: CaptionLine[]) => void;
  hasExistingCaptions: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTENSIONS = [".srt", ".vtt"];

/**
 * CaptionUpload -- Drag-and-drop or file picker for SRT/VTT caption files.
 *
 * Validates file extension (.srt or .vtt) and size (max 2MB).
 * POSTs to /api/video/upload-captions with FormData containing the
 * file and videoSessionId. Calls onUploadComplete with parsed captions.
 */
export function CaptionUpload({
  videoSessionId,
  onUploadComplete,
  hasExistingCaptions,
}: CaptionUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const name = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      return "Only .srt and .vtt files are supported";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File must be smaller than 2MB";
    }
    return null;
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("videoSessionId", videoSessionId);

        const res = await fetch("/api/video/upload-captions", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            data?.error ?? `Upload failed (${res.status})`
          );
        }

        const data = await res.json();
        onUploadComplete(data.captions ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      } finally {
        setIsUploading(false);
      }
    },
    [videoSessionId, onUploadComplete, validateFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
      // Reset input so the same file can be re-selected
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [uploadFile]
  );

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        disabled={isUploading}
        className={cn(
          "w-full rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
          dragActive
            ? "border-primary/70 bg-primary/10"
            : "border-border hover:border-primary/40 bg-card/70",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <Upload className="h-6 w-6 mx-auto text-primary/80 mb-2" />
        <p className="text-sm text-foreground">
          {isUploading
            ? "Uploading..."
            : hasExistingCaptions
              ? "Replace captions"
              : "Upload caption file"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Drag and drop or click to select (.srt or .vtt)
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".srt,.vtt"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload caption file"
      />

      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
