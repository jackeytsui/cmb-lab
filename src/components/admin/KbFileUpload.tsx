"use client";

import { useState, useRef } from "react";
import { Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react";

interface KbFileUploadProps {
  entryId: string;
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * PDF file upload component for knowledge base entries.
 *
 * Features:
 * - Dashed drop zone with click-to-upload
 * - Client-side validation (PDF type, <10MB)
 * - Upload progress with spinner
 * - Success state showing chunk count
 * - Error state with message
 */
export function KbFileUpload({ entryId, onUploadComplete }: KbFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    chunkCount?: number;
    filename?: string;
    warning?: string;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleZoneClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset result
    setResult(null);

    // Client-side validation
    if (file.type !== "application/pdf") {
      setResult({ success: false, error: "Only PDF files are supported." });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setResult({
        success: false,
        error: "File too large. Maximum size is 10MB.",
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/admin/knowledge/entries/${entryId}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      setResult({
        success: true,
        chunkCount: data.chunkCount,
        filename: file.name,
        warning: data.warning,
      });

      onUploadComplete?.();
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      <button
        type="button"
        onClick={handleZoneClick}
        disabled={uploading}
        className="w-full rounded-lg border-2 border-dashed border-zinc-600 p-8 text-center hover:border-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-sm text-zinc-300">Uploading and processing...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-zinc-500" />
            <p className="text-sm text-zinc-300">Upload PDF</p>
            <p className="text-xs text-zinc-500">
              Click to select a PDF file (max 10MB)
            </p>
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Result feedback */}
      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.success
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-red-500/10 border border-red-500/20"
          }`}
        >
          {result.success ? (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-green-300">
                  <span className="font-medium">{result.filename}</span>{" "}
                  uploaded successfully.
                </p>
                <p className="text-green-400/70 mt-0.5">
                  {result.chunkCount} {result.chunkCount === 1 ? "chunk" : "chunks"}{" "}
                  extracted.
                </p>
                {result.warning && (
                  <p className="text-yellow-400/70 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {result.warning}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
