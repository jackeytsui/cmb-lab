"use client";

import { useState } from "react";

interface PromptFormProps {
  prompt: {
    id: string;
    slug: string;
    name: string;
    currentContent: string;
    currentVersion: number;
  };
  onVersionCreated?: (newVersion: number) => void;
}

/**
 * PromptForm component - inline editing form for AI prompt content.
 *
 * Features:
 * - Textarea for editing prompt content
 * - Optional change note for version tracking
 * - Character count display
 * - Success/error feedback
 */
export function PromptForm({ prompt, onVersionCreated }: PromptFormProps) {
  const [content, setContent] = useState(prompt.currentContent);
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ version: number } | null>(null);

  const isContentChanged = content !== prompt.currentContent;

  const handleSave = async () => {
    if (!isContentChanged) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/prompts/${prompt.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          changeNote: changeNote.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save prompt");
      }

      const data = await response.json();
      setSuccess({ version: data.version });
      setChangeNote("");

      // Call callback if provided
      if (onVersionCreated) {
        onVersionCreated(data.version);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Prompt</h2>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-green-400 text-sm">
          Saved as version {success.version}
        </div>
      )}

      {/* Content textarea */}
      <div className="mb-4">
        <label htmlFor="prompt-content" className="sr-only">
          Prompt Content
        </label>
        <textarea
          id="prompt-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[300px] bg-zinc-800 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
          placeholder="Enter prompt content..."
          disabled={saving}
        />
        <div className="mt-1 text-xs text-zinc-500">
          {content.length.toLocaleString()} characters
        </div>
      </div>

      {/* Change note input */}
      <div className="mb-4">
        <label htmlFor="change-note" className="sr-only">
          Change Note
        </label>
        <input
          id="change-note"
          type="text"
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="What changed? (optional)"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          disabled={saving}
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !isContentChanged}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {!isContentChanged && !saving && (
          <span className="text-xs text-zinc-500">No changes to save</span>
        )}
      </div>
    </div>
  );
}
