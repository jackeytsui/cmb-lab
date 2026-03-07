"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Loader2, Trash2, Save } from "lucide-react";

interface KbEntryFormProps {
  mode: "create" | "edit";
  entry?: {
    id: string;
    title: string;
    content: string;
    categoryId: string | null;
    status: string;
  };
  categories: { id: string; name: string }[];
  onSuccess?: () => void;
}

/**
 * Reusable KB entry form for create and edit modes.
 *
 * - Create mode: POST /api/admin/knowledge/entries
 * - Edit mode: PATCH /api/admin/knowledge/entries/[id]
 * - Delete: DELETE /api/admin/knowledge/entries/[id] (edit mode only)
 */
export function KbEntryForm({
  mode,
  entry,
  categories,
  onSuccess,
}: KbEntryFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [status, setStatus] = useState(entry?.status ?? "published");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const url =
        mode === "create"
          ? "/api/admin/knowledge/entries"
          : `/api/admin/knowledge/entries/${entry!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          categoryId: categoryId || null,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save entry");
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/knowledge");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    if (!window.confirm("Are you sure you want to delete this entry? This will also delete all associated chunks and files.")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/knowledge/entries/${entry.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete entry");
      }

      router.push("/admin/knowledge");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 space-y-5">
        {/* Title */}
        <div>
          <label
            htmlFor="kb-title"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="kb-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Entry title"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        {/* Category */}
        <div>
          <label
            htmlFor="kb-category"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Category
          </label>
          <select
            id="kb-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label
            htmlFor="kb-status"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Status
          </label>
          <select
            id="kb-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Content */}
        <div>
          <label
            htmlFor="kb-content"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Content <span className="text-red-400">*</span>
          </label>
          <textarea
            id="kb-content"
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter knowledge content... Supports markdown formatting."
            rows={12}
            className="w-full min-h-[300px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-y"
          />
        </div>
      </div>

      {/* Error message */}
      {error && <ErrorAlert message={error} />}

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <div>
          {mode === "edit" && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deleting ? "Deleting..." : "Delete Entry"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/knowledge")}
            disabled={saving || deleting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || deleting || !title.trim() || !content.trim()}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving
              ? "Saving..."
              : mode === "create"
              ? "Create Entry"
              : "Save Changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
