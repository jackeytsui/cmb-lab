"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { playWithGain, type PlayWithGainHandle } from "@/lib/play-with-gain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  ChevronDown,
  Upload,
  FileJson,
  Pencil,
  Loader2,
  Volume2,
  X,
  Wand2,
  Play,
  Pause,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScriptLine {
  id: string;
  scriptId: string;
  sortOrder: number;
  role: "speaker" | "responder";
  cantoneseText: string;
  mandarinText: string;
  cantoneseRomanisation: string;
  mandarinRomanisation: string;
  englishText: string;
  cantoneseAudioUrl: string | null;
  mandarinAudioUrl: string | null;
}

interface Script {
  id: string;
  title: string;
  description: string | null;
  speakerRole: string;
  responderRole: string;
  sortOrder: number;
  lines: ScriptLine[];
}

interface LineInput {
  role: "speaker" | "responder";
  cantoneseText: string;
  mandarinText: string;
  cantoneseRomanisation: string;
  mandarinRomanisation: string;
  englishText: string;
  sortOrder?: number;
}

const emptyLine = (): LineInput => ({
  role: "speaker",
  cantoneseText: "",
  mandarinText: "",
  cantoneseRomanisation: "",
  mandarinRomanisation: "",
  englishText: "",
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminScriptsClient() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create / Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [speakerRole, setSpeakerRole] = useState("");
  const [responderRole, setResponderRole] = useState("");
  const [lines, setLines] = useState<LineInput[]>([emptyLine()]);

  // Bulk upload dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // Audio upload state
  const [uploadingAudio, setUploadingAudio] = useState<string | null>(null);
  // Audio regenerate (TTS) state — key = `${lineId}-${field}`
  const [regeneratingAudio, setRegeneratingAudio] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch scripts
  // -----------------------------------------------------------------------

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accelerator/scripts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setScripts(data.scripts ?? []);
    } catch (err) {
      console.error("Error fetching scripts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  // -----------------------------------------------------------------------
  // Create / Edit
  // -----------------------------------------------------------------------

  function openCreate() {
    setEditingScript(null);
    setTitle("");
    setDescription("");
    setSpeakerRole("");
    setResponderRole("");
    setLines([emptyLine()]);
    setDialogOpen(true);
  }

  function openEdit(script: Script) {
    setEditingScript(script);
    setTitle(script.title);
    setDescription(script.description ?? "");
    setSpeakerRole(script.speakerRole);
    setResponderRole(script.responderRole);
    setLines(
      script.lines.map((l) => ({
        role: l.role as "speaker" | "responder",
        cantoneseText: l.cantoneseText,
        mandarinText: l.mandarinText,
        cantoneseRomanisation: l.cantoneseRomanisation,
        mandarinRomanisation: l.mandarinRomanisation,
        englishText: l.englishText,
        sortOrder: l.sortOrder,
      }))
    );
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!title || !speakerRole || !responderRole) return;
    setSaving(true);

    try {
      const payload = {
        ...(editingScript ? { id: editingScript.id } : {}),
        title,
        description: description || undefined,
        speakerRole,
        responderRole,
        lines: lines.map((l, idx) => ({ ...l, sortOrder: l.sortOrder ?? idx })),
      };

      const method = editingScript ? "PUT" : "POST";
      const res = await fetch("/api/admin/accelerator/scripts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }

      setDialogOpen(false);
      await fetchScripts();
    } catch (err) {
      console.error("Error saving script:", err);
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async function handleDelete(id: string) {
    if (!confirm("Delete this script and all its lines?")) return;

    try {
      const res = await fetch("/api/admin/accelerator/scripts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      await fetchScripts();
    } catch (err) {
      console.error("Error deleting script:", err);
    }
  }

  // -----------------------------------------------------------------------
  // Bulk upload JSON
  // -----------------------------------------------------------------------

  async function handleBulkUpload() {
    const file = bulkFileRef.current?.files?.[0];
    if (!file) return;

    setSaving(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const res = await fetch("/api/admin/accelerator/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Bulk upload failed");
      }

      setBulkOpen(false);
      if (bulkFileRef.current) bulkFileRef.current.value = "";
      await fetchScripts();
    } catch (err) {
      console.error("Bulk upload error:", err);
      alert(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Audio upload per line
  // -----------------------------------------------------------------------

  async function handleAudioUpload(
    scriptId: string,
    lineId: string,
    field: "cantoneseAudioUrl" | "mandarinAudioUrl",
    file: File
  ) {
    const uploadKey = `${lineId}-${field}`;
    setUploadingAudio(uploadKey);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "pathname",
        `conversation-scripts/${scriptId}/${lineId}/${file.name}`
      );
      const uploadRes = await fetch("/api/admin/accelerator/scripts/upload", {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${uploadRes.status})`);
      }
      const { url: uploadedUrl } = (await uploadRes.json()) as { url: string };

      // Find the script and its lines, update the specific line's audio URL
      const script = scripts.find((s) => s.id === scriptId);
      if (!script) return;

      const updatedLines = script.lines.map((line) => ({
        role: line.role as "speaker" | "responder",
        cantoneseText: line.cantoneseText,
        mandarinText: line.mandarinText,
        cantoneseRomanisation: line.cantoneseRomanisation,
        mandarinRomanisation: line.mandarinRomanisation,
        englishText: line.englishText,
        cantoneseAudioUrl:
          line.id === lineId && field === "cantoneseAudioUrl"
            ? uploadedUrl
            : line.cantoneseAudioUrl,
        mandarinAudioUrl:
          line.id === lineId && field === "mandarinAudioUrl"
            ? uploadedUrl
            : line.mandarinAudioUrl,
        sortOrder: line.sortOrder,
      }));

      await fetch("/api/admin/accelerator/scripts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scriptId, lines: updatedLines }),
      });

      await fetchScripts();
    } catch (err) {
      console.error("Audio upload error:", err);
      alert(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(null);
    }
  }

  // -----------------------------------------------------------------------
  // Regenerate audio via TTS for one line/field
  // -----------------------------------------------------------------------

  async function handleRegenerateAudio(
    lineId: string,
    field: "cantoneseAudioUrl" | "mandarinAudioUrl",
  ) {
    const key = `${lineId}-${field}`;
    setRegeneratingAudio(key);
    try {
      const res = await fetch(
        "/api/admin/accelerator/scripts/regenerate-audio",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineId, field }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Regenerate failed (${res.status})`);
      }
      await fetchScripts();
    } catch (err) {
      console.error("Audio regenerate error:", err);
      alert(err instanceof Error ? err.message : "Audio regenerate failed");
    } finally {
      setRegeneratingAudio(null);
    }
  }

  // -----------------------------------------------------------------------
  // Line management in form
  // -----------------------------------------------------------------------

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof LineInput, value: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Script
        </Button>

        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <FileJson className="w-4 h-4 mr-2" />
              Bulk Upload JSON
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Upload Scripts</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Upload a JSON file containing an array of scripts with nested
                lines. Each script should have: title, speakerRole, responderRole,
                and a lines array.
              </p>
              <Input
                ref={bulkFileRef}
                type="file"
                accept=".json"
                className="cursor-pointer"
              />
              <Button onClick={handleBulkUpload} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Upload
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Scripts list */}
      {scripts.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">
          No scripts yet. Add your first conversation script.
        </p>
      ) : (
        <div className="space-y-3">
          {scripts.map((script) => (
            <Collapsible key={script.id}>
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CollapsibleTrigger className="flex items-center gap-2 text-left group">
                      <ChevronDown className="w-4 h-4 text-zinc-500 transition-transform group-data-[state=open]:rotate-180" />
                      <div>
                        <CardTitle className="text-lg text-zinc-100">
                          {script.title}
                        </CardTitle>
                        {script.description && (
                          <p className="text-sm text-zinc-400 mt-0.5">
                            {script.description}
                          </p>
                        )}
                        <p className="text-xs text-zinc-500 mt-1">
                          {script.speakerRole} / {script.responderRole} &middot;{" "}
                          {script.lines.length} lines
                        </p>
                      </div>
                    </CollapsibleTrigger>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(script)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(script.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {script.lines.map((line) => (
                      <div
                        key={line.id}
                        className="border border-zinc-800 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${
                              line.role === "speaker"
                                ? "bg-blue-900/40 text-blue-400"
                                : "bg-emerald-900/40 text-emerald-400"
                            }`}
                          >
                            {line.role === "speaker"
                              ? script.speakerRole
                              : script.responderRole}
                          </span>
                          <span className="text-xs text-zinc-600">
                            #{line.sortOrder + 1}
                          </span>
                        </div>

                        {/* Cantonese */}
                        <div>
                          <p className="text-base text-amber-200">
                            {line.cantoneseText}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {line.cantoneseRomanisation}
                          </p>
                        </div>

                        {/* Mandarin */}
                        <div>
                          <p className="text-base text-sky-200">
                            {line.mandarinText}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {line.mandarinRomanisation}
                          </p>
                        </div>

                        <p className="text-xs text-zinc-500 italic">
                          {line.englishText}
                        </p>

                        {/* Audio upload controls */}
                        <div className="flex gap-3 pt-1">
                          <AudioUploadButton
                            label="Cantonese Audio"
                            lineId={line.id}
                            field="cantonese"
                            audioUrl={line.cantoneseAudioUrl}
                            uploading={
                              uploadingAudio ===
                              `${line.id}-cantoneseAudioUrl`
                            }
                            regenerating={
                              regeneratingAudio ===
                              `${line.id}-cantoneseAudioUrl`
                            }
                            onFileSelect={(file) =>
                              handleAudioUpload(
                                script.id,
                                line.id,
                                "cantoneseAudioUrl",
                                file
                              )
                            }
                            onRegenerate={() =>
                              handleRegenerateAudio(line.id, "cantoneseAudioUrl")
                            }
                          />
                          <AudioUploadButton
                            label="Mandarin Audio"
                            lineId={line.id}
                            field="mandarin"
                            audioUrl={line.mandarinAudioUrl}
                            uploading={
                              uploadingAudio ===
                              `${line.id}-mandarinAudioUrl`
                            }
                            regenerating={
                              regeneratingAudio ===
                              `${line.id}-mandarinAudioUrl`
                            }
                            onFileSelect={(file) =>
                              handleAudioUpload(
                                script.id,
                                line.id,
                                "mandarinAudioUrl",
                                file
                              )
                            }
                            onRegenerate={() =>
                              handleRegenerateAudio(line.id, "mandarinAudioUrl")
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingScript ? "Edit Script" : "Add Script"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Family Dinner"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Speaker Role</Label>
                  <Input
                    value={speakerRole}
                    onChange={(e) => setSpeakerRole(e.target.value)}
                    placeholder="e.g. Parent"
                  />
                </div>
                <div>
                  <Label>Responder Role</Label>
                  <Input
                    value={responderRole}
                    onChange={(e) => setResponderRole(e.target.value)}
                    placeholder="e.g. Child"
                  />
                </div>
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Dialogue Lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line
                </Button>
              </div>

              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="border border-zinc-800 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        Line {idx + 1}
                      </span>
                      <select
                        value={line.role}
                        onChange={(e) =>
                          updateLine(idx, "role", e.target.value)
                        }
                        className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
                      >
                        <option value="speaker">Speaker</option>
                        <option value="responder">Responder</option>
                      </select>
                    </div>
                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeLine(idx)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Cantonese Text</Label>
                      <Input
                        value={line.cantoneseText}
                        onChange={(e) =>
                          updateLine(idx, "cantoneseText", e.target.value)
                        }
                        placeholder="Cantonese characters"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Cantonese Romanisation</Label>
                      <Input
                        value={line.cantoneseRomanisation}
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "cantoneseRomanisation",
                            e.target.value
                          )
                        }
                        placeholder="Jyutping"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Mandarin Text</Label>
                      <Input
                        value={line.mandarinText}
                        onChange={(e) =>
                          updateLine(idx, "mandarinText", e.target.value)
                        }
                        placeholder="Mandarin characters"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Mandarin Romanisation</Label>
                      <Input
                        value={line.mandarinRomanisation}
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "mandarinRomanisation",
                            e.target.value
                          )
                        }
                        placeholder="Pinyin"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">English Translation</Label>
                    <Input
                      value={line.englishText}
                      onChange={(e) =>
                        updateLine(idx, "englishText", e.target.value)
                      }
                      placeholder="English meaning"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingScript ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio upload button sub-component
// ---------------------------------------------------------------------------

function AudioUploadButton({
  label,
  lineId,
  field,
  audioUrl,
  uploading,
  regenerating,
  onFileSelect,
  onRegenerate,
}: {
  label: string;
  lineId: string;
  field: "cantonese" | "mandarin";
  audioUrl: string | null;
  uploading: boolean;
  regenerating: boolean;
  onFileSelect: (file: File) => void;
  onRegenerate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<PlayWithGainHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const busy = uploading || regenerating;

  const stopPlayback = useCallback(() => {
    if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
    }
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }
    // Cache-bust so a just-uploaded replacement plays instead of a stale cached copy
    const url = `/api/accelerator/scripts/stream/${lineId}?field=${field}&t=${Date.now()}`;
    const handle = playWithGain(url);
    handleRef.current = handle;
    setPlaying(true);
    handle.ended.then(() => {
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
      setPlaying(false);
    });
  }, [playing, lineId, field, stopPlayback]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // If the stored URL changes (e.g. after regenerate or replace), stop any
  // in-flight playback so the next click fetches the fresh file.
  useEffect(() => {
    stopPlayback();
  }, [audioUrl, stopPlayback]);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
        }}
      />

      {audioUrl ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            disabled={busy}
            className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title={playing ? "Stop" : "Play uploaded audio"}
          >
            {playing ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            <Volume2 className="w-3 h-3" />
            <span className="text-xs">{label}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onRegenerate}
            disabled={busy}
            title="Regenerate audio from stored text via TTS"
          >
            {regenerating ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3 mr-1" />
            )}
            Regenerate
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {uploading ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Upload className="w-3 h-3 mr-1" />
            )}
            {label}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onRegenerate}
            disabled={busy}
            title="Generate audio from stored text via TTS"
          >
            {regenerating ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3 mr-1" />
            )}
            Generate
          </Button>
        </>
      )}
    </div>
  );
}
