"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Undo2, X, Loader2, Clock } from "lucide-react";

interface BulkResult {
  studentId: string;
  studentName?: string;
  success: boolean;
  error?: string;
}

interface BulkResultsDialogProps {
  open: boolean;
  onClose: () => void;
  operationId: string;
  operationType: string;
  results: BulkResult[];
  summary: { total: number; succeeded: number; failed: number };
  expiresAt: number; // timestamp (ms) when undo expires
  onUndoComplete: () => void;
}

const OPERATION_LABELS: Record<string, string> = {
  assign_course: "Assign Course",
  remove_course: "Remove Course",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
};

export function BulkResultsDialog({
  open,
  onClose,
  operationId,
  operationType,
  results,
  summary,
  expiresAt,
  onUndoComplete,
}: BulkResultsDialogProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (!open || undone) return;

    const update = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [open, expiresAt, undone]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    setUndoError(null);

    try {
      const res = await fetch("/api/admin/students/bulk/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to undo");
      }

      setUndone(true);
      onUndoComplete();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to undo operation");
    } finally {
      setUndoing(false);
    }
  }, [operationId, onUndoComplete]);

  if (!open) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Bulk Operation Complete
            </h3>
            <p className="text-sm text-zinc-400 mt-0.5">
              {OPERATION_LABELS[operationType] || operationType}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800/50">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {summary.succeeded} succeeded
          </span>
          {summary.failed > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-red-500/15 text-red-400">
              <XCircle className="w-3.5 h-3.5" />
              {summary.failed} failed
            </span>
          )}
          <span className="text-xs text-zinc-500 ml-auto">
            {summary.total} total
          </span>
        </div>

        {/* Results list */}
        <div className="px-6 py-3 max-h-64 overflow-y-auto">
          <div className="space-y-1.5">
            {results.map((result, idx) => (
              <div
                key={`${result.studentId}-${idx}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  result.success
                    ? "bg-zinc-800/30"
                    : "bg-red-950/30 border border-red-900/30"
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span className="text-zinc-300 truncate font-mono text-xs">
                  {result.studentName || result.studentId}
                </span>
                {result.error && (
                  <span className="text-red-400 text-xs ml-auto shrink-0">
                    {result.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Undo section */}
        <div className="px-6 py-4 border-t border-zinc-800 space-y-2">
          {undone ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Operation undone successfully
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleUndo}
                  disabled={undoing || secondsLeft <= 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {undoing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Undo2 className="w-4 h-4" />
                  )}
                  Undo this operation
                </button>
                {secondsLeft > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(secondsLeft)} remaining
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">
                    Undo window expired
                  </span>
                )}
              </div>
              {undoError && (
                <p className="text-sm text-red-400">{undoError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
