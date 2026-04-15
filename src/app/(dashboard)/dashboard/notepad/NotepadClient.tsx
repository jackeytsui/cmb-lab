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
  ArrowRightLeft,
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

async function createNote(
  pane: Pane,
  text: string,
): Promise<{ note: NotepadNote | null; error: string | null }> {
  try {
    const res = await fetch("/api/notepad/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pane, text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { note: null, error: data.error ?? `Failed (${res.status})` };
    }
    const data = await res.json();
    return { note: data.note ?? null, error: null };
  } catch (err) {
    return { note: null, error: err instanceof Error ? err.message : "Network error" };
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
// Single saved note render — mirrors ICGC NoteCard layout:
// inline action row above content (visible on hover, hidden during edit).
// Edit mode exposes 3 fields: text, romanization, translation.
// NotebookPen toggles a per-note explanation/notes section.
// ArrowRightLeft copies (translates) the note to the other pane.
// ---------------------------------------------------------------------------

function NoteRow({
  note,
  index,
  language,
  scriptMode,
  fontSize,
  toneColorsEnabled,
  onDelete,
  onToggleStar,
  onSaveEdit,
  onSaveExplanation,
  onCopyOver,
}: {
  note: NotepadNote;
  index: number;
  language: Language;
  scriptMode: ScriptMode;
  fontSize: number;
  toneColorsEnabled: boolean;
  onDelete: () => void;
  onToggleStar: () => void;
  onSaveEdit: (updates: {
    textOverride: string | null;
    romanizationOverride: string | null;
    translationOverride: string | null;
  }) => void;
  onSaveExplanation: (explanation: string | null) => void;
  onCopyOver: () => Promise<void>;
}) {
  const baseText = note.textOverride ?? note.text;
  const processed = useProcessedChineseText({
    committedText: baseText,
    scriptMode,
    language,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(baseText);
  const [draftRomanization, setDraftRomanization] = useState(
    note.romanizationOverride ?? "",
  );
  const [draftTranslation, setDraftTranslation] = useState(
    note.translationOverride ?? "",
  );

  // Explanation state
  const [showExplanation, setShowExplanation] = useState(!!note.explanation);
  const [explanationDraft, setExplanationDraft] = useState(note.explanation ?? "");
  const [isEditingExplanation, setIsEditingExplanation] = useState(
    !note.explanation,
  );
  const [isCopyingOver, setIsCopyingOver] = useState(false);

  const startEditing = () => {
    setDraftText(baseText);
    setDraftRomanization(note.romanizationOverride ?? "");
    setDraftTranslation(note.translationOverride ?? "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const t = draftText.trim();
    onSaveEdit({
      textOverride: t && t !== note.text ? t : null,
      romanizationOverride: draftRomanization.trim() || null,
      translationOverride: draftTranslation.trim() || null,
    });
    setIsEditing(false);
  };

  const handleExplanationSave = () => {
    onSaveExplanation(explanationDraft.trim() || null);
    setIsEditingExplanation(false);
  };

  const handleCopyOver = async () => {
    if (isCopyingOver) return;
    setIsCopyingOver(true);
    try {
      await onCopyOver();
    } finally {
      setIsCopyingOver(false);
    }
  };

  const otherLangLabel = language === "zh-CN" ? "Cantonese" : "Mandarin";

  return (
    <div className="rounded-md border border-border bg-background p-3 flex gap-2">
      <span className="self-start inline-flex min-w-5 justify-center text-[10px] text-muted-foreground pt-1">
        {index + 1}.
      </span>
      <div className="flex-1 space-y-2 min-w-0">
        {/* Action row — inline, hidden during edit */}
        {!isEditing && (
          <div className="flex items-center justify-end gap-1 -mb-1">
            <button
              type="button"
              onClick={onToggleStar}
              title={note.starred === 1 ? "Unstar" : "Star note"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded transition-colors",
                note.starred === 1
                  ? "text-amber-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Star className={cn("size-3.5", note.starred === 1 && "fill-amber-400")} />
            </button>
            <button
              type="button"
              onClick={handleCopyOver}
              disabled={isCopyingOver}
              title={`Copy over to ${otherLangLabel}`}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-cyan-500 transition-colors disabled:opacity-50"
            >
              {isCopyingOver ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowRightLeft className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowExplanation((p) => !p)}
              title="Add notes / explanation"
              className={cn(
                "inline-flex size-6 items-center justify-center rounded transition-colors",
                showExplanation || note.explanation
                  ? "text-violet-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <NotebookPen className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={startEditing}
              title="Edit note"
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete note"
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}

        {/* Body: edit mode OR rendered output */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              rows={3}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Chinese text"
            />
            <input
              value={draftRomanization}
              onChange={(e) => setDraftRomanization(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={language === "zh-HK" ? "Jyutping (override)" : "Pinyin (override)"}
            />
            <textarea
              value={draftTranslation}
              onChange={(e) => setDraftTranslation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="English translation (override)"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-md border border-input bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
            translationCache={
              note.translationOverride
                ? new Map([[baseText, note.translationOverride]])
                : processed.translationCache
            }
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

        {/* Explanation / notes section */}
        {(showExplanation || note.explanation) && !isEditing && (
          <div className="mt-2 border-t border-border/50 pt-2">
            {isEditingExplanation ? (
              <div className="space-y-1.5">
                <textarea
                  value={explanationDraft}
                  onChange={(e) => setExplanationDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleExplanationSave();
                    }
                  }}
                  rows={2}
                  autoFocus
                  className="w-full rounded-md border border-violet-500/25 bg-violet-500/5 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-y"
                  placeholder="Add notes or explanation for this entry..."
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingExplanation(false);
                      setExplanationDraft(note.explanation ?? "");
                    }}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExplanationSave}
                    className="rounded px-2 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-500 hover:bg-violet-500/25 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="group/exp flex items-start gap-1.5">
                <p className="flex-1 text-xs text-violet-400/80 whitespace-pre-wrap leading-relaxed">
                  {note.explanation}
                </p>
                <div className="shrink-0 flex gap-1 opacity-0 group-hover/exp:opacity-100 transition-all">
                  <button
                    type="button"
                    onClick={() => setIsEditingExplanation(true)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExplanationDraft("");
                      setIsEditingExplanation(true);
                      onSaveExplanation(null);
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
  onCopyOverNote,
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
  onCopyOverNote: (id: string) => Promise<void>;
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
            {sortedNotes.map((note, index) => (
              <NoteRow
                key={note.id}
                note={note}
                index={index}
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
                onSaveEdit={(updates) => void onUpdateNote(note.id, updates)}
                onSaveExplanation={(explanation) =>
                  void onUpdateNote(note.id, { explanation })
                }
                onCopyOver={() => onCopyOverNote(note.id)}
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

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = useCallback(async (pane: Pane, text: string) => {
    const { note, error } = await createNote(pane, text);
    if (note) {
      setNotes((prev) => [note, ...prev]);
      flashSaved();
      setErrorMsg(null);
    } else {
      setErrorMsg(error ?? "Failed to save note");
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

  const handleCopyOver = useCallback(
    async (id: string) => {
      const source = notes.find((n) => n.id === id);
      if (!source) return;
      const sourceText = source.textOverride ?? source.text;
      const fromLang = source.pane;
      const toLang: Pane = source.pane === "mandarin" ? "cantonese" : "mandarin";
      try {
        const res = await fetch("/api/coaching/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceText, fromLang, toLang }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error ?? `Copy-over failed (${res.status})`);
          return;
        }
        const data = await res.json();
        if (!data.translated) {
          setErrorMsg("Translation came back empty");
          return;
        }
        const { note: created, error } = await createNote(toLang, data.translated);
        if (created) {
          setNotes((prev) => [created, ...prev]);
          flashSaved();
        } else {
          setErrorMsg(error ?? "Failed to save translated note");
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Copy-over failed");
      }
    },
    [notes],
  );

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
      {errorMsg && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
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
          onCopyOverNote={handleCopyOver}
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
          onCopyOverNote={handleCopyOver}
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
