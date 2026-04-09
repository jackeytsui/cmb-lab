"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Plus, Trash2, Upload, Check, X } from "lucide-react";

type Clip = {
  id: string;
  title: string;
  pinyin: string;
  chinese: string;
  videoUrl: string;
  sortOrder: number;
};

function EditableClipRow({
  clip,
  onSave,
  onDelete,
}: {
  clip: Clip;
  onSave: (id: string, data: Partial<Clip>) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [pinyinVal, setPinyinVal] = useState(clip.pinyin);
  const [chinese, setChinese] = useState(clip.chinese);
  const [sortOrder, setSortOrder] = useState(String(clip.sortOrder));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(clip.id, {
      title,
      pinyin: pinyinVal,
      chinese,
      sortOrder: parseInt(sortOrder) || 0,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(clip.title);
    setPinyinVal(clip.pinyin);
    setChinese(clip.chinese);
    setSortOrder(String(clip.sortOrder));
    setEditing(false);
  };

  const handleReplaceVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`tone-mastery/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/accelerator-extra/tone-mastery/upload",
      });
      await onSave(clip.id, { videoUrl: blob.url });
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
        <Input value={chinese} onChange={(e) => setChinese(e.target.value)} className="w-16 text-center text-sm" placeholder="中文" />
        <Input value={pinyinVal} onChange={(e) => setPinyinVal(e.target.value)} className="w-24 text-sm" placeholder="pinyin" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 text-sm" placeholder="English" />
        <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-14 text-sm text-center" type="number" placeholder="#" />
        <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-500" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel}>
          <X className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2 group">
      <span className="text-sm font-medium w-16 text-center">{clip.chinese}</span>
      <span className="text-sm text-muted-foreground">({clip.pinyin})</span>
      <span className="text-sm text-foreground flex-1">{clip.title}</span>
      <span className="text-xs text-muted-foreground/50 tabular-nums w-8 text-right">#{clip.sortOrder}</span>

      {/* Video status */}
      {clip.videoUrl && clip.videoUrl !== "placeholder" ? (
        <span className="text-[10px] text-emerald-500 font-medium">MP4</span>
      ) : (
        <label className="cursor-pointer">
          <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleReplaceVideo} disabled={uploading} />
          <span className="text-[10px] text-amber-500 font-medium hover:underline cursor-pointer">
            {uploading ? "Uploading..." : "Upload MP4"}
          </span>
        </label>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {clip.videoUrl && clip.videoUrl !== "placeholder" && (
          <label className="cursor-pointer">
            <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleReplaceVideo} disabled={uploading} />
            <Button size="sm" variant="ghost" className="pointer-events-none h-7 w-7 p-0" disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-muted-foreground" />}
            </Button>
          </label>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDelete(clip.id)}>
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

export function ToneMasteryAdminClient() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroVideoUrl, setHeroVideoUrl] = useState("");
  const [heroSaving, setHeroSaving] = useState(false);
  const [heroSaved, setHeroSaved] = useState(false);

  // New clip form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", pinyin: "", chinese: "", sortOrder: "0" });
  const [uploading, setUploading] = useState(false);

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
      const nextSort = clips.length > 0 ? Math.max(...clips.map((c) => c.sortOrder)) + 1 : 1;
      const res = await fetch("/api/admin/accelerator-extra/tone-mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || file.name.replace(/\.\w+$/, ""),
          pinyin: form.pinyin || "",
          chinese: form.chinese || "",
          videoUrl: blob.url,
          groupNumber: 1,
          itemNumber: 1,
          variant: "A",
          sortOrder: parseInt(form.sortOrder) || nextSort,
        }),
      });
      if (res.ok) {
        setForm({ title: "", pinyin: "", chinese: "", sortOrder: "0" });
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

  const handleUpdateClip = async (clipId: string, data: Partial<Clip>) => {
    await fetch(`/api/admin/accelerator-extra/tone-mastery/${clipId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchClips();
  };

  const handleDelete = async (clipId: string) => {
    if (!confirm("Delete this clip?")) return;
    await fetch(`/api/admin/accelerator-extra/tone-mastery/${clipId}`, { method: "DELETE" });
    fetchClips();
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
        <h3 className="text-lg font-semibold">Introduction Video URL</h3>
        <p className="text-xs text-muted-foreground">YouTube URL for the 30-min introduction video shown at the top of the Tone Mastery page.</p>
        <div className="flex gap-2">
          <Input
            value={heroVideoUrl}
            onChange={(e) => setHeroVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1"
          />
          <Button onClick={handleSaveHeroVideo} disabled={heroSaving} variant="outline">
            {heroSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : heroSaved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Clips */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Clips ({clips.length})</h3>
          <Button onClick={() => setShowForm(!showForm)} variant="outline" size="sm" className="gap-1.5">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancel" : "Add Clip"}
          </Button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input placeholder="Chinese (e.g. 高中)" value={form.chinese} onChange={(e) => setForm({ ...form, chinese: e.target.value })} />
              <Input placeholder="Pinyin (e.g. gāo zhōng)" value={form.pinyin} onChange={(e) => setForm({ ...form, pinyin: e.target.value })} />
              <Input placeholder="English (e.g. High school)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Input placeholder="Sort #" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} type="number" />
            </div>
            <label className="cursor-pointer inline-block">
              <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleUploadAndCreate} disabled={uploading || !form.chinese} />
              <Button variant="default" className="gap-2 pointer-events-none" disabled={uploading || !form.chinese}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading..." : "Upload MP4 & Create Clip"}
              </Button>
            </label>
          </div>
        )}

        {/* Clips list */}
        <div className="space-y-2">
          {clips.map((clip) => (
            <EditableClipRow
              key={clip.id}
              clip={clip}
              onSave={handleUpdateClip}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
