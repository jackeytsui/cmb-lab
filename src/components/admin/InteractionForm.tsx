"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { Interaction } from "@/db/schema/interactions";
import type { VideoPrompt } from "@/db/schema/video-prompts";
import { Video } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface PromptEntry {
  /** Existing interaction ID (for updates). Undefined = new prompt. */
  existingId?: string;
  language: "cantonese" | "mandarin";
  prompt: string;
  expectedAnswer: string;
  videoPromptId?: string | null;
}

export interface InteractionFormProps {
  lessonId: string;
  /** Selected timestamp (seconds into video) */
  timestamp: number;
  /** All existing interactions at this timestamp (empty = create mode) */
  existingInteractions: Interaction[];
  /** Called after all saves/deletes complete — parent should refetch */
  onSave: () => void;
  onCancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function makeInitialPrompts(existing: Interaction[]): PromptEntry[] {
  if (existing.length > 0) {
    return existing.map((i) => ({
      existingId: i.id,
      language: i.language === "both" ? "cantonese" : i.language,
      prompt: i.prompt,
      expectedAnswer: i.expectedAnswer ?? "",
      videoPromptId: i.videoPromptId,
    }));
  }
  return [{ language: "cantonese", prompt: "", expectedAnswer: "", videoPromptId: null }];
}

// ── Component ──────────────────────────────────────────────────────

export function InteractionForm({
  lessonId,
  timestamp: timestampProp,
  existingInteractions,
  onSave,
  onCancel,
}: InteractionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Shared fields
  const [timestamp, setTimestamp] = useState(timestampProp);
  const [type, setType] = useState<"text" | "audio" | "video">(
    (existingInteractions[0]?.type as "text" | "audio" | "video") ?? "text"
  );
  const [correctThreshold, setCorrectThreshold] = useState(
    existingInteractions[0]?.correctThreshold ?? 80
  );

  // Dynamic prompt list
  const [prompts, setPrompts] = useState<PromptEntry[]>(() =>
    makeInitialPrompts(existingInteractions)
  );

  // Video prompts library
  const [videoPrompts, setVideoPrompts] = useState<VideoPrompt[]>([]);
  useEffect(() => {
    fetch("/api/coach/video-prompts")
      .then((res) => res.json())
      .then((data) => {
        if (data.prompts) setVideoPrompts(data.prompts);
      })
      .catch(() => console.error("Failed to load video prompts"));
  }, []);

  const isEditMode = existingInteractions.length > 0;

  // Sync timestamp when parent changes it (user clicks new timeline position)
  useEffect(() => {
    setTimestamp(timestampProp);
  }, [timestampProp]);

  // Reset form when existingInteractions change (user clicks different marker)
  useEffect(() => {
    setPrompts(makeInitialPrompts(existingInteractions));
    setType((existingInteractions[0]?.type as "text" | "audio" | "video") ?? "text");
    setCorrectThreshold(existingInteractions[0]?.correctThreshold ?? 80);
  }, [existingInteractions]);

  // ── Prompt list management ─────────────────────────────────────

  const addPrompt = useCallback(() => {
    setPrompts((prev) => [
      ...prev,
      { language: "mandarin", prompt: "", expectedAnswer: "", videoPromptId: null },
    ]);
  }, []);

  const removePrompt = useCallback((index: number) => {
    setPrompts((prev) => {
      if (prev.length <= 1) return prev; // keep at least one
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updatePrompt = useCallback(
    (index: number, field: keyof PromptEntry, value: string | null) => {
      setPrompts((prev) =>
        prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
      );
    },
    []
  );

  // ── Submit ─────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiError(null);

    // Validate prompts
    const validPrompts = prompts.filter((p) => p.prompt.trim().length > 0 || (type === "video" && p.videoPromptId));
    if (validPrompts.length === 0) {
      setApiError("At least one prompt is required");
      setIsSubmitting(false);
      return;
    }
    
    // For video type, require prompt ID
    if (type === "video") {
        for (const p of validPrompts) {
            if (!p.videoPromptId) {
                setApiError("Please select a video prompt");
                setIsSubmitting(false);
                return;
            }
        }
    }

    // Use prompt title as fallback if prompt text is empty for video type
    if (type === "video") {
        validPrompts.forEach(p => {
            if (!p.prompt.trim() && p.videoPromptId) {
                const vp = videoPrompts.find(v => v.id === p.videoPromptId);
                if (vp) p.prompt = vp.title;
            }
        });
    }

    try {
      // Figure out creates, updates, deletes
      const keptIds = new Set(
        validPrompts.filter((p) => p.existingId).map((p) => p.existingId!)
      );
      const toDelete = existingInteractions.filter(
        (i) => !keptIds.has(i.id)
      );
      const toUpdate = validPrompts.filter((p) => p.existingId);
      const toCreate = validPrompts.filter((p) => !p.existingId);

      // Delete removed
      for (const interaction of toDelete) {
        const res = await fetch(
          `/api/admin/interactions/${interaction.id}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to delete interaction");
        }
      }

      // Update existing
      for (const p of toUpdate) {
        const res = await fetch(`/api/admin/interactions/${p.existingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timestamp,
            type,
            language: p.language,
            prompt: p.prompt.trim(),
            expectedAnswer: p.expectedAnswer.trim() || null,
            videoPromptId: type === "video" ? p.videoPromptId : null,
            correctThreshold,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(
            data.message || data.error || "Failed to update interaction"
          );
        }
      }

      // Create new
      for (const p of toCreate) {
        const res = await fetch("/api/admin/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            timestamp,
            type,
            language: p.language,
            prompt: p.prompt.trim(),
            expectedAnswer: p.expectedAnswer.trim() || null,
            videoPromptId: type === "video" ? p.videoPromptId : null,
            correctThreshold,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(
            data.message || data.error || "Failed to create interaction"
          );
        }
      }

      onSave();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete All ─────────────────────────────────────────────────

  const handleDeleteAll = async () => {
    if (existingInteractions.length === 0) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      for (const interaction of existingInteractions) {
        const res = await fetch(
          `/api/admin/interactions/${interaction.id}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Failed to delete");
      }
      onSave();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border border-zinc-700 bg-zinc-800 p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          {isEditMode
            ? `Edit Interaction @ ${formatTime(existingInteractions[0].timestamp)}`
            : "New Interaction"}
        </h3>
        {isEditMode && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                disabled={isSubmitting}
              >
                Delete All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-zinc-700 bg-zinc-800">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">
                  Delete All Prompts?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  This will remove all {existingInteractions.length} prompt
                  {existingInteractions.length !== 1 ? "s" : ""} at{" "}
                  {formatTime(existingInteractions[0].timestamp)}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-600 bg-zinc-700 text-white hover:bg-zinc-600">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {apiError && <ErrorAlert message={apiError} />}

      {/* Timestamp */}
      <div className="space-y-2">
        <Label htmlFor="timestamp" className="text-zinc-300">
          Timestamp <span className="text-red-400">*</span>
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="timestamp"
            type="number"
            value={timestamp}
            onChange={(e) => setTimestamp(Math.max(0, parseInt(e.target.value) || 0))}
            min={0}
            className="w-24 border-zinc-600 bg-zinc-700 text-white"
          />
          <span className="text-zinc-400">
            seconds ({formatTime(timestamp)})
          </span>
        </div>
      </div>

      {/* Type */}
      <div className="space-y-2">
        <Label className="text-zinc-300">
          Response Type <span className="text-red-400">*</span>
        </Label>
        <Select value={type} onValueChange={(v) => setType(v as "text" | "audio" | "video")}>
          <SelectTrigger className="border-zinc-600 bg-zinc-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-zinc-600 bg-zinc-700">
            <SelectItem value="text" className="text-white hover:bg-zinc-600">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-500" />
                Text Response
              </span>
            </SelectItem>
            <SelectItem value="audio" className="text-white hover:bg-zinc-600">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Audio Response
              </span>
            </SelectItem>
            <SelectItem value="video" className="text-white hover:bg-zinc-600">
              <span className="flex items-center gap-2">
                <Video className="h-4 w-4 text-rose-500" />
                Video Response (VideoAsk)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pass Threshold */}
      <div className="space-y-2">
        <Label htmlFor="correctThreshold" className="text-zinc-300">
          Pass Threshold
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="correctThreshold"
            type="number"
            value={correctThreshold}
            onChange={(e) =>
              setCorrectThreshold(
                Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
              )
            }
            min={0}
            max={100}
            className="w-24 border-zinc-600 bg-zinc-700 text-white"
          />
          <span className="text-zinc-400">%</span>
        </div>
      </div>

      {/* ── Prompts Section ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-300">
            Prompts <span className="text-red-400">*</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPrompt}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            + Add Prompt
          </Button>
        </div>

        <p className="text-xs text-zinc-500">
          Add one prompt per language. Students only see prompts matching their
          selected language.
        </p>

        {prompts.map((entry, index) => (
          <div
            key={index}
            className="relative space-y-3 rounded-lg border border-zinc-600 bg-zinc-900/50 p-4"
          >
            {/* Prompt header: language + remove */}
            <div className="flex items-center gap-3">
              <Select
                value={entry.language}
                onValueChange={(v) => updatePrompt(index, "language", v as "cantonese" | "mandarin")}
              >
                <SelectTrigger className="w-40 border-zinc-600 bg-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-600 bg-zinc-700">
                  <SelectItem
                    value="cantonese"
                    className="text-white hover:bg-zinc-600"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Cantonese
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="mandarin"
                    className="text-white hover:bg-zinc-600"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Mandarin
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              <span className="flex-1 text-xs text-zinc-500">
                Prompt {index + 1}
                {entry.existingId && (
                  <span className="ml-1 text-zinc-600">(saved)</span>
                )}
              </span>

              {prompts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePrompt(index)}
                  className="text-zinc-500 transition-colors hover:text-red-400"
                  title="Remove prompt"
                >
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
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {type === "video" ? (
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">Select Video Prompt</Label>
                    <Select 
                        value={entry.videoPromptId ?? ""} 
                        onValueChange={(v) => updatePrompt(index, "videoPromptId", v)}
                    >
                        <SelectTrigger className="border-zinc-600 bg-zinc-700 text-white">
                            <SelectValue placeholder="Choose a recorded video..." />
                        </SelectTrigger>
                        <SelectContent className="border-zinc-600 bg-zinc-700 max-h-[200px]">
                            {videoPrompts.length === 0 ? (
                                <div className="p-2 text-xs text-zinc-500 text-center">
                                    No video prompts found. Create one in the Coach Dashboard.
                                </div>
                            ) : (
                                videoPrompts.map((vp) => (
                                    <SelectItem key={vp.id} value={vp.id} className="text-white hover:bg-zinc-600">
                                        {vp.title}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}

            {/* Prompt text */}
            <Textarea
              value={entry.prompt}
              onChange={(e) => updatePrompt(index, "prompt", e.target.value)}
              placeholder={
                entry.language === "cantonese"
                  ? "e.g. 我唔想過嚟"
                  : "e.g. 我不想过来"
              }
              rows={2}
              className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
            />

            {/* Expected answer */}
            <Textarea
              value={entry.expectedAnswer}
              onChange={(e) =>
                updatePrompt(index, "expectedAnswer", e.target.value)
              }
              placeholder="Expected answer / grading context (optional)"
              rows={1}
              className="resize-y border-zinc-600 bg-zinc-700 text-sm text-white placeholder:text-zinc-500"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-zinc-700 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : isEditMode
              ? `Update ${prompts.length} Prompt${prompts.length !== 1 ? "s" : ""}`
              : `Add ${prompts.length} Prompt${prompts.length !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </form>
  );
}
