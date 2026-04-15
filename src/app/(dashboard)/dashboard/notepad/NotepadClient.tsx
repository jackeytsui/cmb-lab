"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { useProcessedChineseText, type ScriptMode } from "@/hooks/useProcessedChineseText";
import { useReaderPreferences } from "@/hooks/useReaderPreferences";
import { exportCoachingNotes } from "@/lib/coaching-export";
import {
  Minus,
  Plus,
  NotebookPen,
  Trash2,
  Pencil,
  Star,
  Download,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Language = "zh-CN" | "zh-HK";
type Pane = "mandarin" | "cantonese";

const MIN_FONT = 16;
const MAX_FONT = 72;
const DEFAULT_FONT = 32;
const PANE_STATE_DEBOUNCE_MS = 600;

type PaneState = {
  scriptMode: ScriptMode;
  fontSize: number;
};

type NotepadNote = {
  id: string;
  pane: Pane;
  text: string;
  order: number;
  starred: number;
  textOverride: string | null;
  romanizationOverride: string | null;
  translationOverride: string | null;
  explanation: string | null;
  createdAt: string | number;
  updatedAt: string | number;
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function loadPaneStates(): Promise<Record<Pane, PaneState>> {
  const fallback: Record<Pane, PaneState> = {
    mandarin: { scriptMode: "simplified", fontSize: DEFAULT_FONT },
    cantonese: { scriptMode: "simplified", fontSize: DEFAULT_FONT },
  };
  try {
    const res = await fetch("/api/notepad", { cache: "no-store" });
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      mandarin: data.mandarin
        ? {
            scriptMode:
              data.mandarin.scriptMode === "traditional" ? "traditional" : "simplified",
            fontSize:
              typeof data.mandarin.fontSize === "number" ? data.mandarin.fontSize : DEFAULT_FONT,
          }
        : fallback.mandarin,
      cantonese: data.cantonese
        ? {
            scriptMode:
              data.cantonese.scriptMode === "traditional" ? "traditional" : "simplified",
            fontSize:
              typeof data.cantonese.fontSize === "number" ? data.cantonese.fontSize : DEFAULT_FONT,
          }
        : fallback.cantonese,
    };
  } catch {
    return fallback;
  }
}

async function savePaneState(pane: Pane, state: PaneState) {
  try {
    await fetch("/api/notepad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pane, text: "", ...state }),
    });
  } catch {
    // non-fatal
  }
}

async function fetchNotes(): Promise<NotepadNote[]> {
  try {
    const res = await fetch("/api/notepad/notes", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.notes) ? data.notes : [];
  } catch {
    return [];
  }
}

async function createNote(pane: Pane, text: string): Promise<NotepadNote | null> {
  try {
    const res = await fetch("/api/notepad/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pane, text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.note ?? null;
  } catch {
    return null;
  }
}

async function patchNote(
  id: string,
  updates: Partial<{
    textOverride: string | null;
    romanizationOverride: string | null;
    translationOverride: string | null;
    explanation: string | null;
    starred: number;
    order: number;
  }>,
): Promise<NotepadNote | null> {
  try {
    const res = await fetch(`/api/notepad/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.note ?? null;
  } catch {
    return null;
  }
}

async function deleteNote(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/notepad/notes/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Single saved note render (with inline edit + star + delete)
// ---------------------------------------------------------------------------

function NoteRow({
  note,
  language,
  scriptMode,
  fontSize,
  toneColorsEnabled,
  onDelete,
  onToggleStar,
  onSaveEdit,
}: {
  note: NotepadNote;
  language: Language;
  scriptMode: ScriptMode;
  fontSize: number;
  toneColorsEnabled: boolean;
  onDelete: () => void;
  onToggleStar: () => void;
  onSaveEdit: (textOverride: string | null) => void;
}) {
  const baseText = note.textOverride ?? note.text;
  const processed = useProcessedChineseText({
    committedText: baseText,
    scriptMode,
    language,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(baseText);

  const handleSave = () => {
    const next = draft.trim();
    onSaveEdit(next && next !== note.text ? next : null);
    setIsEditing(false);
  };

  return (
    <div className="group relative rounded-md border border-border bg-background p-3 space-y-2">
      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onToggleStar}
          title={note.starred === 1 ? "Unstar" : "Star"}
          className="size-7 rounded-md border border-border hover:bg-accent flex items-center justify-center"
        >
          <Star
            className={cn(
              "size-3.5",
              note.starred === 1
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(baseText);
            setIsEditing((v) => !v);
          }}
          title="Edit text"
          className="size-7 rounded-md border border-border hover:bg-accent flex items-center justify-center"
        >
          <Pencil className="size-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="size-7 rounded-md border border-border hover:bg-red-500/10 hover:border-red-500/40 flex items-center justify-center"
        >
          <Trash2 className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      {note.starred === 1 && !isEditing && (
        <Star className="size-3 fill-amber-400 text-amber-400 absolute top-3 left-3" />
      )}

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              } else if (e.key === "Escape") {
                setIsEditing(false);
              }
            }}
            rows={2}
            autoFocus
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : processed.segments.length > 0 ? (
        <ReaderTextArea
          segments={processed.segments}
          showPinyin={language === "zh-CN"}
          showJyutping={language === "zh-HK"}
          showEnglish={true}
          translationMode="proper"
          fontSize={fontSize}
          language={language}
          onSpeakSentence={processed.handleSpeakSentence}
          isSpeaking={processed.isPlaying || processed.ttsLoading}
          speakingText={processed.speakingText}
          ttsError={processed.ttsError}
          translationCache={processed.translationCache}
          onTranslationFetched={(text, translation) => {
            processed.setTranslationCache((prev) => {
              const next = new Map(prev);
              next.set(text, translation);
              return next;
            });
          }}
          batchTranslations={processed.batchTranslations}
          isTranslating={processed.isTranslating}
          toneColorsEnabled={toneColorsEnabled}
        />
      ) : (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single language pane — input + notes list
// ---------------------------------------------------------------------------

function NotepadPane({
  pane,
  label,
  sublabel,
  language,
  initialState,
  hydrated,
  notes,
  onCreate,
  onUpdateNote,
  onDeleteNote,
  toneColorsEnabled,
  notesAscending,
  onToggleSort,
  onExport,
  exporting,
}: {
  pane: Pane;
  label: string;
  sublabel: string;
  language: Language;
  initialState: PaneState;
  hydrated: boolean;
  notes: NotepadNote[];
  onCreate: (pane: Pane, text: string) => Promise<void>;
  onUpdateNote: (id: string, updates: Parameters<typeof patchNote>[1]) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  toneColorsEnabled: boolean;
  notesAscending: boolean;
  onToggleSort: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [scriptMode, setScriptMode] = useState<ScriptMode>(initialState.scriptMode);
  const [fontSize, setFontSize] = useState<number>(initialState.fontSize);
  const [submitting, setSubmitting] = useState(false);

  // Sync when hydration finishes
  const didHydrateRef = useRef(false);
  useEffect(() => {
    if (!hydrated || didHydrateRef.current) return;
    didHydrateRef.current = true;
    setScriptMode(initialState.scriptMode);
    setFontSize(initialState.fontSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Persist pane state (scriptMode / fontSize) with debounce
  const savedSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!hydrated) return;
    const snap = `${scriptMode}|${fontSize}`;
    if (snap === savedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      savedSnapshotRef.current = snap;
      void savePaneState(pane, { scriptMode, fontSize });
    }, PANE_STATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [scriptMode, fontSize, pane, hydrated]);

  const handleCommit = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    await onCreate(pane, text);
    setDraft("");
    setSubmitting(false);
  }, [draft, onCreate, pane]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) =>
      notesAscending ? a.order - b.order : b.order - a.order,
    );
  }, [notes, notesAscending]);

  const isMandarin = language === "zh-CN";

  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <NotebookPen className="size-5 text-primary" />
            {label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
        </div>

        <div className="flex items-center gap-3">
          {/* Simplified / Traditional */}
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setScriptMode("simplified")}
              className={cn(
                "px-2.5 py-1 transition-colors",
                scriptMode === "simplified"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Simplified
            </button>
            <button
              type="button"
              onClick={() => setScriptMode("traditional")}
              className={cn(
                "px-2.5 py-1 transition-colors",
                scriptMode === "traditional"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Traditional
            </button>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Font size</span>
            <button
              type="button"
              onClick={() => setFontSize(Math.max(MIN_FONT, fontSize - 2))}
              className="size-6 rounded-md border border-border hover:bg-accent flex items-center justify-center"
              aria-label="Decrease font size"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-8 text-center tabular-nums text-foreground">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize(Math.min(MAX_FONT, fontSize + 2))}
              className="size-6 rounded-md border border-border hover:bg-accent flex items-center justify-center"
              aria-label="Increase font size"
            >
              <Plus className="size-3" />
            </button>
          </div>

          {/* Export */}
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || notes.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            title="Export all notepad notes to XLSX"
          >
            {exporting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            Export
          </button>
        </div>
      </div>

      {/* Input row */}
      <label className="text-xs font-medium text-muted-foreground">
        Traditional Chinese Input ({isMandarin ? "Mandarin" : "Cantonese"})
      </label>
      <div className="mt-1 flex items-stretch gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleCommit();
            }
          }}
          rows={1}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          placeholder="Paste or type Traditional Chinese here — press Enter to save as a note..."
        />
        <button
          type="button"
          onClick={() => void handleCommit()}
          disabled={!draft.trim() || submitting}
          className="rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 inline-flex items-center gap-1"
        >
          {submitting ? <Loader2 className="size-3 animate-spin" /> : null}
          Enter
        </button>
      </div>

      {/* Notes list */}
      {notes.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">
              Saved Notes ({notes.length})
            </div>
            <button
              type="button"
              onClick={onToggleSort}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {notesAscending ? "↑ Oldest first" : "↓ Newest first"}
            </button>
          </div>
          <div className="space-y-2">
            {sortedNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                language={language}
                scriptMode={scriptMode}
                fontSize={fontSize}
                toneColorsEnabled={toneColorsEnabled}
                onDelete={() => void onDeleteNote(note.id)}
                onToggleStar={() =>
                  void onUpdateNote(note.id, {
                    starred: note.starred === 1 ? 0 : 1,
                  })
                }
                onSaveEdit={(textOverride) =>
                  void onUpdateNote(note.id, { textOverride })
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">
          No saved notes yet — paste Chinese text above and press Enter.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level: loads state, delegates to panes
// ---------------------------------------------------------------------------

export function NotepadClient() {
  const { toneColorsEnabled } = useReaderPreferences("notepad");
  const [paneStates, setPaneStates] = useState<Record<Pane, PaneState>>({
    mandarin: { scriptMode: "simplified", fontSize: DEFAULT_FONT },
    cantonese: { scriptMode: "simplified", fontSize: DEFAULT_FONT },
  });
  const [hydrated, setHydrated] = useState(false);
  const [notes, setNotes] = useState<NotepadNote[]>([]);
  const [notesAscending, setNotesAscending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPaneStates(), fetchNotes()]).then(([states, list]) => {
      if (cancelled) return;
      setPaneStates(states);
      setNotes(list);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const flashSaved = () => {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  };

  const handleCreate = useCallback(async (pane: Pane, text: string) => {
    const created = await createNote(pane, text);
    if (created) {
      setNotes((prev) => [created as NotepadNote, ...prev]);
      flashSaved();
    }
  }, []);

  const handleUpdate = useCallback(
    async (id: string, updates: Parameters<typeof patchNote>[1]) => {
      const updated = await patchNote(id, updates);
      if (updated) {
        setNotes((prev) => prev.map((n) => (n.id === id ? (updated as NotepadNote) : n)));
        flashSaved();
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    const ok = await deleteNote(id);
    if (ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportCoachingNotes(
        [
          {
            title: "Notepad",
            notes: notes
              .filter((n) => n.pane === "mandarin" || n.pane === "cantonese")
              .map((n) => ({
                text: n.text,
                pane: n.pane,
                textOverride: n.textOverride,
                romanizationOverride: n.romanizationOverride,
                translationOverride: n.translationOverride,
                explanation: n.explanation,
              })),
          },
        ],
        { fileName: `notepad-${new Date().toISOString().slice(0, 10)}.xlsx`, sessionTitle: "Notepad" },
      );
    } finally {
      setExporting(false);
    }
  }, [notes]);

  const mandarinNotes = notes.filter((n) => n.pane === "mandarin");
  const cantoneseNotes = notes.filter((n) => n.pane === "cantonese");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notepad</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste Traditional Chinese and press Enter to save a note. Notes
            render per-character pinyin/jyutping, tone coloring and English
            translation. Your notes auto-save and stay private to you.
          </p>
        </div>
        {saveFlash && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
            <Check className="size-3" />
            Saved
          </span>
        )}
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <NotepadPane
          pane="mandarin"
          label="Mandarin Output"
          sublabel="Simplified/Traditional display with Pinyin and Mandarin → English translation."
          language="zh-CN"
          initialState={paneStates.mandarin}
          hydrated={hydrated}
          notes={mandarinNotes}
          onCreate={handleCreate}
          onUpdateNote={handleUpdate}
          onDeleteNote={handleDelete}
          toneColorsEnabled={toneColorsEnabled}
          notesAscending={notesAscending}
          onToggleSort={() => setNotesAscending((v) => !v)}
          onExport={handleExport}
          exporting={exporting}
        />
        <NotepadPane
          pane="cantonese"
          label="Cantonese Output"
          sublabel="Simplified/Traditional display with Jyutping and Cantonese → English translation."
          language="zh-HK"
          initialState={paneStates.cantonese}
          hydrated={hydrated}
          notes={cantoneseNotes}
          onCreate={handleCreate}
          onUpdateNote={handleUpdate}
          onDeleteNote={handleDelete}
          toneColorsEnabled={toneColorsEnabled}
          notesAscending={notesAscending}
          onToggleSort={() => setNotesAscending((v) => !v)}
          onExport={handleExport}
          exporting={exporting}
        />
      </div>
    </div>
  );
}
