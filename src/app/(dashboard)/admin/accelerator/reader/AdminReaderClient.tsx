"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Upload, Pencil, Trash2 } from "lucide-react";

interface Passage {
  id: string;
  title: string;
  description: string | null;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const API_URL = "/api/admin/accelerator/reader";

export default function AdminReaderClient() {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchPassages = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        setPassages(data.passages ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPassages();
  }, [fetchPassages]);

  function openAdd() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setBody("");
    setSortOrder(0);
    setDialogOpen(true);
  }

  function openEdit(passage: Passage) {
    setEditingId(passage.id);
    setTitle(passage.title);
    setDescription(passage.description ?? "");
    setBody(passage.body);
    setSortOrder(passage.sortOrder);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch(API_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, title, description: description || null, body, sortOrder }),
        });
        if (res.ok) {
          setDialogOpen(false);
          fetchPassages();
        }
      } else {
        // Create
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: description || undefined, body, sortOrder }),
        });
        if (res.ok) {
          setDialogOpen(false);
          fetchPassages();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(API_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      if (res.ok || res.status === 204) {
        setDeleteId(null);
        fetchPassages();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Ensure it has passages array
      const payload = json.passages
        ? json
        : { passages: Array.isArray(json) ? json : [json] };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        fetchPassages();
      }
    } catch (err) {
      console.error("Bulk upload failed:", err);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (loading) {
    return (
      <div className="text-zinc-400 text-sm py-8">Loading passages...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Add Passage
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="w-4 h-4 mr-1" />
          {uploading ? "Uploading..." : "Bulk Upload JSON"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleBulkUpload}
        />
      </div>

      {/* Passages List */}
      {passages.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4">
          No curated passages yet. Add one or bulk upload a JSON file.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_4rem_5rem] md:grid-cols-[2rem_1fr_2fr_4rem_5rem] gap-2 px-3 py-2 bg-zinc-900 text-xs text-zinc-400 font-medium">
            <span>#</span>
            <span>Title</span>
            <span className="hidden md:block">Body (preview)</span>
            <span>Order</span>
            <span>Actions</span>
          </div>
          {/* Rows */}
          {passages.map((p, idx) => (
            <div
              key={p.id}
              className="grid grid-cols-[2rem_1fr_4rem_5rem] md:grid-cols-[2rem_1fr_2fr_4rem_5rem] gap-2 px-3 py-2 border-t border-zinc-800 items-center"
            >
              <span className="text-zinc-400 text-sm">{idx + 1}</span>
              <span className="font-medium text-zinc-200 text-sm truncate">
                {p.title}
              </span>
              <span className="hidden md:block text-zinc-400 text-sm truncate">
                {p.body.length > 100
                  ? p.body.slice(0, 100) + "..."
                  : p.body}
              </span>
              <span className="text-zinc-400 text-sm">{p.sortOrder}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(p.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Passage" : "Add Passage"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="passage-title">Title</Label>
              <Input
                id="passage-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Ordering at a Restaurant"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passage-desc">Description (English, optional)</Label>
              <Input
                id="passage-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. A short passage about daily morning routines"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passage-body">Body (Chinese text)</Label>
              <Textarea
                id="passage-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Paste Chinese text here..."
                rows={8}
                className="font-serif"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passage-sort">Sort Order</Label>
              <Input
                id="passage-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
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
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim() || !body.trim()}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Passage?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            This will permanently remove the passage and all associated read
            status records.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
