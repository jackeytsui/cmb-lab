"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Upload } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TypingSentence {
  id: string;
  language: "mandarin" | "cantonese";
  chineseText: string;
  englishText: string;
  romanisation: string;
  sortOrder: number;
}

type FormData = Omit<TypingSentence, "id">;

const EMPTY_FORM: FormData = {
  language: "mandarin",
  chineseText: "",
  englishText: "",
  romanisation: "",
  sortOrder: 0,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminTypingClient() {
  const [sentences, setSentences] = useState<TypingSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadSentences = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accelerator/typing");
      if (res.ok) {
        const data = await res.json();
        setSentences(data.sentences ?? []);
      }
    } catch {
      // Non-critical on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSentences();
  }, [loadSentences]);

  // ---------------------------------------------------------------------------
  // Add / Edit
  // ---------------------------------------------------------------------------

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(s: TypingSentence) {
    setEditingId(s.id);
    setForm({
      language: s.language,
      chineseText: s.chineseText,
      englishText: s.englishText,
      romanisation: s.romanisation,
      sortOrder: s.sortOrder,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.chineseText.trim() || !form.englishText.trim() || !form.romanisation.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch("/api/admin/accelerator/typing", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
        if (res.ok) {
          setDialogOpen(false);
          await loadSentences();
        }
      } else {
        // Create
        const res = await fetch("/api/admin/accelerator/typing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setDialogOpen(false);
          await loadSentences();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete() {
    if (!deleteId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/accelerator/typing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      if (res.ok || res.status === 204) {
        setDeleteId(null);
        await loadSentences();
      }
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk Upload JSON
  // ---------------------------------------------------------------------------

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkStatus(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Accept both { sentences: [...] } and bare array
      const payload = Array.isArray(parsed)
        ? { sentences: parsed }
        : parsed;

      if (!payload.sentences || !Array.isArray(payload.sentences)) {
        setBulkStatus("Invalid format. Expected { sentences: [...] } or an array.");
        return;
      }

      const res = await fetch("/api/admin/accelerator/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setBulkStatus(`Successfully uploaded ${data.count} sentence(s).`);
        await loadSentences();
      } else {
        const err = await res.json().catch(() => null);
        setBulkStatus(
          `Upload failed: ${err?.error ?? res.statusText}${
            err?.details ? ` — ${JSON.stringify(err.details)}` : ""
          }`
        );
      }
    } catch (err) {
      setBulkStatus(`Failed to parse JSON file: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="text-sm text-zinc-400 py-8 text-center">
        Loading sentences...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Add Sentence
        </Button>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1" />
            Bulk Upload JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleBulkUpload}
          />
        </div>

        <span className="text-xs text-zinc-500 ml-auto">
          {sentences.length} sentence(s) total
        </span>
      </div>

      {/* Bulk upload status */}
      {bulkStatus && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            bulkStatus.startsWith("Successfully")
              ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800"
              : "bg-red-900/30 text-red-400 border border-red-800"
          }`}
        >
          {bulkStatus}
        </div>
      )}

      {/* Sentences table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Language</th>
              <th className="px-4 py-3 text-left">Chinese Text</th>
              <th className="px-4 py-3 text-left">English Text</th>
              <th className="px-4 py-3 text-left">Romanisation</th>
              <th className="px-4 py-3 text-center">Order</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sentences.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No sentences yet. Add one or upload a JSON file.
                </td>
              </tr>
            )}
            {sentences.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      s.language === "mandarin"
                        ? "bg-blue-900/40 text-blue-400"
                        : "bg-amber-900/40 text-amber-400"
                    }`}
                  >
                    {s.language}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-200 font-medium">
                  {s.chineseText}
                </td>
                <td className="px-4 py-3 text-zinc-300">{s.englishText}</td>
                <td className="px-4 py-3 text-zinc-400">{s.romanisation}</td>
                <td className="px-4 py-3 text-center text-zinc-500">
                  {s.sortOrder}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(s.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Sentence" : "Add Sentence"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={form.language}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    language: v as "mandarin" | "cantonese",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandarin">Mandarin</SelectItem>
                  <SelectItem value="cantonese">Cantonese</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chinese Text (expected answer)</Label>
              <Input
                value={form.chineseText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, chineseText: e.target.value }))
                }
                placeholder="e.g. ..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>English Text (prompt)</Label>
              <Input
                value={form.englishText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, englishText: e.target.value }))
                }
                placeholder="e.g. Hello"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Romanisation</Label>
              <Input
                value={form.romanisation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, romanisation: e.target.value }))
                }
                placeholder="e.g. ni3 hao3"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sortOrder: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Sentence</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            Are you sure you want to delete this typing sentence? This action
            cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
