"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";

type Clip = {
  id: string;
  title: string;
  pinyin: string;
  chinese: string;
  videoUrl: string;
  groupNumber: number;
  itemNumber: number;
  variant: string;
  sortOrder: number;
};

export function ToneMasteryAdminClient() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroVideoUrl, setHeroVideoUrl] = useState("");
  const [heroSaving, setHeroSaving] = useState(false);
  const [heroSaved, setHeroSaved] = useState(false);

  // New clip form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    pinyin: "",
    chinese: "",
    groupNumber: "1",
    itemNumber: "1",
    variant: "A",
    sortOrder: "0",
  });
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchClips = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accelerator-extra/tone-mastery");
      const data = await res.json();
      setClips(data.clips ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClips();
    // Fetch hero video URL
    fetch("/api/admin/accelerator/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? {};
        setHeroVideoUrl(s["tone_mastery.hero_video_url"] || "");
      })
      .catch(() => {});
  }, [fetchClips]);

  const handleSaveHeroVideo = async () => {
    setHeroSaving(true);
    try {
      await fetch("/api/admin/accelerator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "tone_mastery.hero_video_url", value: heroVideoUrl }),
      });
      setHeroSaved(true);
      setTimeout(() => setHeroSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setHeroSaving(false);
    }
  };

  const handleUploadAndCreate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`tone-mastery/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/accelerator-extra/tone-mastery/upload",
      });

      const res = await fetch("/api/admin/accelerator-extra/tone-mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || file.name.replace(/\.\w+$/, ""),
          pinyin: form.pinyin,
          chinese: form.chinese,
          videoUrl: blob.url,
          groupNumber: parseInt(form.groupNumber) || 1,
          itemNumber: parseInt(form.itemNumber) || 1,
          variant: form.variant || "A",
          sortOrder: parseInt(form.sortOrder) || 0,
        }),
      });

      if (res.ok) {
        setForm({ title: "", pinyin: "", chinese: "", groupNumber: "1", itemNumber: "1", variant: "A", sortOrder: "0" });
        setShowForm(false);
        fetchClips();
      }
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (clipId: string) => {
    if (!confirm("Delete this clip?")) return;
    setDeleting(clipId);
    try {
      await fetch(`/api/admin/accelerator-extra/tone-mastery/${clipId}`, {
        method: "DELETE",
      });
      fetchClips();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero video URL */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-lg font-semibold">Hero Video URL</h3>
        <div className="flex gap-2">
          <Input
            value={heroVideoUrl}
            onChange={(e) => setHeroVideoUrl(e.target.value)}
            placeholder="YouTube URL for introduction video"
            className="flex-1"
          />
          <Button onClick={handleSaveHeroVideo} disabled={heroSaving} variant="outline">
            {heroSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : heroSaved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Add clip */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Clips ({clips.length})</h3>
          <Button onClick={() => setShowForm(!showForm)} variant="outline" size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Clip
          </Button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input placeholder="Title (English)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Input placeholder="Pinyin" value={form.pinyin} onChange={(e) => setForm({ ...form, pinyin: e.target.value })} />
              <Input placeholder="Chinese" value={form.chinese} onChange={(e) => setForm({ ...form, chinese: e.target.value })} />
              <Input placeholder="Sort Order" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} type="number" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Group #" value={form.groupNumber} onChange={(e) => setForm({ ...form, groupNumber: e.target.value })} type="number" />
              <Input placeholder="Item #" value={form.itemNumber} onChange={(e) => setForm({ ...form, itemNumber: e.target.value })} type="number" />
              <Input placeholder="Variant (A/B/C)" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="video/*" className="hidden" onChange={handleUploadAndCreate} disabled={uploading} />
              <Button variant="default" className="gap-2 pointer-events-none" disabled={uploading || !form.pinyin || !form.chinese}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading..." : "Upload Video & Create Clip"}
              </Button>
            </label>
          </div>
        )}

        {/* Clips table */}
        <div className="space-y-2">
          {clips.map((clip) => (
            <div key={clip.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2">
              <span className="text-xs text-muted-foreground font-mono w-12">
                {clip.groupNumber}-{clip.itemNumber}{clip.variant}
              </span>
              <span className="text-sm font-medium flex-1">{clip.chinese} ({clip.pinyin})</span>
              <span className="text-xs text-muted-foreground">{clip.title}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(clip.id)}
                disabled={deleting === clip.id}
                className="text-red-500 hover:text-red-400"
              >
                {deleting === clip.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
