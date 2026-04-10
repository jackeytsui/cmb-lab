"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Plus, Trash2, Upload, Check, X, FileSpreadsheet, XCircle } from "lucide-react";

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
  const [uploadStage, setUploadStage] = useState<
    "idle" | "token" | "uploading" | "saving"
  >("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
    console.log(
      `[Tone Mastery] Starting upload for clip ${clip.id}: ${file.name} (${fileSizeMb}MB)`
    );

    // Pre-validate file size (match server limit of 100MB)
    if (file.size > 100 * 1024 * 1024) {
      setUploadError(`File too large: ${fileSizeMb}MB (max 100MB)`);
      e.target.value = "";
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      console.warn(`[Tone Mastery] Upload timed out after 5min for clip ${clip.id}`);
      controller.abort();
    }, 5 * 60 * 1000);

    setUploadError(null);
    setUploading(true);
    setUploadStage("token");
    setUploadPercent(0);
    try {
      console.log(`[Tone Mastery] Requesting upload token from server...`);

      const blob = await upload(`tone-mastery/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/accelerator-extra/tone-mastery/upload",
        abortSignal: controller.signal,
        onUploadProgress: (progress: { percentage: number; loaded: number; total: number }) => {
          if (uploadStage !== "uploading") {
            console.log(`[Tone Mastery] Upload started for clip ${clip.id}`);
            setUploadStage("uploading");
          }
          setUploadPercent(Math.round(progress.percentage));
        },
      });

      console.log(`[Tone Mastery] Upload complete. Blob URL:`, blob.url);
      setUploadStage("saving");
      await onSave(clip.id, { videoUrl: blob.url });
      console.log(`[Tone Mastery] DB updated for clip ${clip.id}`);
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message))) {
        console.log(`[Tone Mastery] Upload cancelled for clip ${clip.id}`);
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Tone Mastery] Upload failed for clip ${clip.id}:`, err);
        setUploadError(msg);
      }
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setUploading(false);
      setUploadStage("idle");
      setUploadPercent(0);
      e.target.value = "";
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploading(false);
    setUploadStage("idle");
    setUploadPercent(0);
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
      {uploading ? (
        <div className="flex items-center gap-2 min-w-[180px] justify-end">
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium tabular-nums">
            <Loader2 className="w-3 h-3 animate-spin" />
            {uploadStage === "token" && "Requesting token..."}
            {uploadStage === "uploading" && `Uploading ${uploadPercent}%`}
            {uploadStage === "saving" && "Saving..."}
            {uploadStage === "idle" && "Starting..."}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-red-500/10"
            onClick={handleCancelUpload}
            title="Cancel upload"
          >
            <XCircle className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ) : uploadError ? (
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] text-red-500 font-medium max-w-[200px] truncate"
            title={uploadError}
          >
            ✕ {uploadError}
          </span>
          <label className="cursor-pointer">
            <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleReplaceVideo} />
            <span className="text-[10px] text-amber-500 font-medium hover:underline cursor-pointer">
              Retry
            </span>
          </label>
        </div>
      ) : clip.videoUrl && clip.videoUrl !== "placeholder" ? (
        <span className="text-[10px] text-emerald-500 font-medium">MP4</span>
      ) : (
        <label className="cursor-pointer">
          <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleReplaceVideo} />
          <span className="text-[10px] text-amber-500 font-medium hover:underline cursor-pointer">
            Upload MP4
          </span>
        </label>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!uploading && clip.videoUrl && clip.videoUrl !== "placeholder" && (
          <label className="cursor-pointer">
            <input type="file" accept="video/mp4,video/*" className="hidden" onChange={handleReplaceVideo} />
            <Button size="sm" variant="ghost" className="pointer-events-none h-7 w-7 p-0">
              <Upload className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </label>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} disabled={uploading}>
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDelete(clip.id)} disabled={uploading}>
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

  // Bulk import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    imported: number;
    skipped: number;
    error?: string;
  } | null>(null);

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

  // Parse TSV/CSV into clip objects.
  // Expected columns (tab or comma separated), optional header row:
  //   Chinese, Pinyin, English, Group, Item, Variant
  const parseBulkInput = useCallback((text: string) => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const rows: Array<{
      chinese: string;
      pinyin: string;
      title: string;
      groupNumber: number;
      itemNumber: number;
      variant: string;
    }> = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip header row if first line contains "chinese" or "pinyin" (case-insensitive)
      if (i === 0 && /chinese|pinyin|english|group/i.test(line) && !/\d/.test(line.split(/[\t,]/)[3] ?? "")) {
        continue;
      }

      const parts = line.split(/\t|,/).map((p) => p.trim());
      if (parts.length < 6) {
        errors.push(`Line ${i + 1}: expected 6 columns, got ${parts.length}`);
        continue;
      }

      const [chinese, pinyinCol, title, groupStr, itemStr, variant] = parts;
      const groupNumber = parseInt(groupStr);
      const itemNumber = parseInt(itemStr);

      if (!chinese || !pinyinCol || !title || !variant) {
        errors.push(`Line ${i + 1}: missing required field`);
        continue;
      }
      if (isNaN(groupNumber) || groupNumber < 1) {
        errors.push(`Line ${i + 1}: invalid group number "${groupStr}"`);
        continue;
      }
      if (isNaN(itemNumber) || itemNumber < 1) {
        errors.push(`Line ${i + 1}: invalid item number "${itemStr}"`);
        continue;
      }

      rows.push({
        chinese,
        pinyin: pinyinCol,
        title,
        groupNumber,
        itemNumber,
        variant: variant.toUpperCase(),
      });
    }

    return { rows, errors };
  }, []);

  const bulkPreview = useCallback(() => {
    const { rows, errors } = parseBulkInput(bulkText);
    return { rows, errors };
  }, [bulkText, parseBulkInput]);

  const handleBulkImport = useCallback(async () => {
    setBulkResult(null);
    const { rows, errors } = parseBulkInput(bulkText);

    if (errors.length > 0) {
      setBulkResult({
        imported: 0,
        skipped: 0,
        error: `Parse errors:\n${errors.join("\n")}`,
      });
      return;
    }

    if (rows.length === 0) {
      setBulkResult({ imported: 0, skipped: 0, error: "No rows to import." });
      return;
    }

    setBulkImporting(true);
    try {
      const res = await fetch("/api/admin/accelerator-extra/tone-mastery/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips: rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkResult({
          imported: 0,
          skipped: 0,
          error: data.error || "Import failed",
        });
        return;
      }
      setBulkResult({
        imported: data.imported ?? 0,
        skipped: data.skipped ?? 0,
      });
      setBulkText("");
      fetchClips();
    } catch (err) {
      setBulkResult({
        imported: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBulkImporting(false);
    }
  }, [bulkText, parseBulkInput, fetchClips]);

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
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setShowBulkImport(!showBulkImport);
                setShowForm(false);
                setBulkResult(null);
              }}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {showBulkImport ? <X className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
              {showBulkImport ? "Cancel" : "Bulk Import"}
            </Button>
            <Button
              onClick={() => {
                setShowForm(!showForm);
                setShowBulkImport(false);
              }}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? "Cancel" : "Add Clip"}
            </Button>
          </div>
        </div>

        {showBulkImport && (() => {
          const preview = bulkPreview();
          return (
            <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Bulk Import Clips (Placeholders)</p>
                <p className="text-xs text-muted-foreground">
                  Paste rows from Google Sheets or similar. Columns (tab-separated):{" "}
                  <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                    Chinese · Pinyin · English · Group · Item · Variant
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Header row is optional. Videos start as placeholders — upload individually after import.
                </p>
              </div>

              <textarea
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setBulkResult(null);
                }}
                placeholder={`没有\tméi yǒu\tNo\t2\t3\tB\n如果\trú guǒ\tIf\t2\t3\tC\n还是\thái shì\tStill\t2\t4\tA`}
                className="w-full min-h-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                disabled={bulkImporting}
              />

              {/* Preview */}
              {bulkText.trim() && (
                <div className="text-xs space-y-1">
                  {preview.errors.length > 0 ? (
                    <div className="text-red-500">
                      <span className="font-medium">Parse errors:</span>
                      <ul className="list-disc list-inside">
                        {preview.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {preview.errors.length > 5 && (
                          <li>...and {preview.errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      <span className="text-emerald-500 font-medium">{preview.rows.length}</span> row
                      {preview.rows.length === 1 ? "" : "s"} ready to import
                    </p>
                  )}
                </div>
              )}

              {/* Result */}
              {bulkResult && (
                <div
                  className={`text-xs rounded-md p-2 ${
                    bulkResult.error
                      ? "bg-red-500/10 text-red-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {bulkResult.error ? (
                    <pre className="whitespace-pre-wrap font-mono text-[11px]">
                      {bulkResult.error}
                    </pre>
                  ) : (
                    <>
                      ✓ Imported {bulkResult.imported} new clip
                      {bulkResult.imported === 1 ? "" : "s"}
                      {bulkResult.skipped > 0 &&
                        ` · Skipped ${bulkResult.skipped} (already exists)`}
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleBulkImport}
                  disabled={
                    bulkImporting ||
                    !bulkText.trim() ||
                    preview.errors.length > 0 ||
                    preview.rows.length === 0
                  }
                  className="gap-2"
                >
                  {bulkImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  {bulkImporting ? "Importing..." : `Import ${preview.rows.length} Clips`}
                </Button>
              </div>
            </div>
          );
        })()}

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
