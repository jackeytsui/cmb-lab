"use client";

/**
 * ImportDialog — Text import dialog for the Chinese Reader.
 *
 * Three tabs:
 *   1. Paste: textarea for pasting Chinese text directly
 *   2. File: drag-and-drop zone for .txt/.pdf upload
 *   3. Generate: AI-generated article by topic + difficulty
 *
 * Plus a "Saved" section showing up to 5 recently imported texts.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText,
  Upload,
  Loader2,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

/** CJK Unified Ideographs range check */
const CJK_REGEX = /[\u4e00-\u9fff]/;

/** Accepted file extensions for the file input */
const ACCEPTED_EXTENSIONS = ".txt,.pdf";

const SAVED_TEXTS_KEY = "reader-saved-texts";
const MAX_SAVED = 5;

interface SavedText {
  title: string;
  text: string;
  savedAt: number;
}

const HSK_LEVELS = [
  { value: "1", label: "Beginner", desc: "HSK 1 — Very simple words" },
  { value: "2", label: "Elementary", desc: "HSK 2 — Basic sentences" },
  { value: "3", label: "Intermediate", desc: "HSK 3 — Everyday topics" },
  { value: "4", label: "Upper Intermediate", desc: "HSK 4 — Complex grammar" },
  { value: "5", label: "Advanced", desc: "HSK 5 — Rich vocabulary" },
  { value: "6", label: "Native", desc: "HSK 6 — Near-native fluency" },
];

function getSavedTexts(storageKey: string): SavedText[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    return JSON.parse(raw) as SavedText[];
  } catch {
    return [];
  }
}

function saveText(text: string, storageKey: string): void {
  const existing = getSavedTexts(storageKey);
  // Generate title from first 30 chars, trimmed at word-ish boundary
  const title = text.slice(0, 30).replace(/\s+$/, "") + (text.length > 30 ? "..." : "");
  // Don't save duplicates (same first 100 chars)
  const fingerprint = text.slice(0, 100);
  const filtered = existing.filter((s) => s.text.slice(0, 100) !== fingerprint);
  const updated = [{ title, text, savedAt: Date.now() }, ...filtered].slice(
    0,
    MAX_SAVED,
  );
  localStorage.setItem(storageKey, JSON.stringify(updated));
}

function removeSavedText(index: number, storageKey: string): SavedText[] {
  const existing = getSavedTexts(storageKey);
  existing.splice(index, 1);
  localStorage.setItem(storageKey, JSON.stringify(existing));
  return existing;
}

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (text: string) => void;
  prefillTopic?: string;
  onSourceImported?: (source: "paste" | "file" | "generate") => void;
  onLevelChange?: (level: string) => void;
  onTabChange?: (tab: "paste" | "file" | "generate") => void;
  lockDuringOnboarding?: boolean;
  forcedActiveTab?: "paste" | "file" | "generate";
  storageScopeKey?: string;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
  prefillTopic,
  onSourceImported,
  onLevelChange,
  onTabChange,
  lockDuringOnboarding = false,
  forcedActiveTab,
  storageScopeKey,
}: ImportDialogProps) {
  const [pasteText, setPasteText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Saved texts
  const [savedTexts, setSavedTexts] = useState<SavedText[]>([]);

  // AI generation
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("3");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("paste");
  const savedTextsKey = storageScopeKey
    ? `${SAVED_TEXTS_KEY}.${storageScopeKey}`
    : SAVED_TEXTS_KEY;

  // Load saved texts when dialog opens
  useEffect(() => {
    if (open) {
      setSavedTexts(getSavedTexts(savedTextsKey));
      if (prefillTopic) {
        setTopic(prefillTopic);
      }
    }
  }, [open, prefillTopic, savedTextsKey]);

  useEffect(() => {
    if (!open || !forcedActiveTab) return;
    setActiveTab(forcedActiveTab);
  }, [forcedActiveTab, open]);

  /** Import text and auto-save */
  const importAndSave = useCallback(
    (text: string) => {
      saveText(text, savedTextsKey);
      onImport(text);
    },
    [onImport, savedTextsKey],
  );

  /** Reset all state when dialog closes */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setPasteText("");
        setIsLoading(false);
        setIsGenerating(false);
        setError(null);
        setWarning(null);
        setIsDragOver(false);
        setActiveTab("paste");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  /** Handle paste tab import */
  const handlePasteImport = useCallback(() => {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setError("Please paste some text first.");
      return;
    }
    if (!CJK_REGEX.test(trimmed)) {
      setError("No Chinese text detected.");
      return;
    }
    setError(null);
    importAndSave(trimmed);
    onSourceImported?.("paste");
    handleOpenChange(false);
  }, [pasteText, importAndSave, handleOpenChange, onSourceImported]);

  /** Upload file to /api/reader/import and process response */
  const uploadToServer = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/reader/import", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        body?.error ?? `Server error (${res.status}). Please try again.`,
      );
    }

    const data = (await res.json()) as {
      text: string;
      encoding: string;
      truncated: boolean;
    };

    if (data.truncated) {
      setWarning("Text truncated to 20,000 characters.");
    }

    return data.text;
  }, []);

  /** Process a selected or dropped file */
  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setWarning(null);
      setIsLoading(true);

      try {
        const name = file.name.toLowerCase();
        const isPdf = name.endsWith(".pdf");

        if (isPdf) {
          const text = await uploadToServer(file);
          importAndSave(text);
          onSourceImported?.("file");
          handleOpenChange(false);
          return;
        }

        // Text file: try UTF-8 client-side first
        const clientText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file."));
          reader.readAsText(file, "utf-8");
        });

        if (CJK_REGEX.test(clientText)) {
          const trimmed =
            clientText.length > 20_000
              ? (() => {
                  setWarning("Text truncated to 20,000 characters.");
                  return clientText.slice(0, 20_000);
                })()
              : clientText;
          importAndSave(trimmed);
          onSourceImported?.("file");
          handleOpenChange(false);
          return;
        }

        // No CJK in UTF-8 — fallback to server-side encoding detection
        const text = await uploadToServer(file);
        importAndSave(text);
        onSourceImported?.("file");
        handleOpenChange(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to process file.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [uploadToServer, importAndSave, handleOpenChange, onSourceImported],
  );

  /** File input change handler */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  /** Drag-and-drop handlers */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  /** AI article generation */
  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }
    setError(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/reader/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), level }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to generate article.");
      }

      const data = await res.json();
      importAndSave(data.article);
      onSourceImported?.("generate");
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate article.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [topic, level, importAndSave, handleOpenChange, onSourceImported]);

  /** Load a saved text */
  const handleLoadSaved = useCallback(
    (text: string) => {
      importAndSave(text);
      handleOpenChange(false);
    },
    [importAndSave, handleOpenChange],
  );

  /** Delete a saved text */
  const handleDeleteSaved = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedTexts(removeSavedText(index, savedTextsKey));
  }, [savedTextsKey]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onInteractOutside={(event) => {
          if (lockDuringOnboarding) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (lockDuringOnboarding) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">Import Text</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Paste text, upload a file, or generate an article with AI.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = value as "paste" | "file" | "generate";
            setActiveTab(next);
            onTabChange?.(next);
          }}
          className="w-full"
        >
          <TabsList className="bg-muted w-full" data-tour-id="import-dialog-tabs">
            <TabsTrigger
              value="paste"
              data-tour-id="import-dialog-tab-paste"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground flex-1"
            >
              <FileText className="size-4" />
              Paste
            </TabsTrigger>
            <TabsTrigger
              value="file"
              data-tour-id="import-dialog-tab-file"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground flex-1"
            >
              <Upload className="size-4" />
              File
            </TabsTrigger>
            <TabsTrigger
              value="generate"
              data-tour-id="import-dialog-tab-generate"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground flex-1"
            >
              <Sparkles className="size-4" />
              Generate
            </TabsTrigger>
          </TabsList>

          {/* Paste Tab */}
          <TabsContent value="paste" className="mt-4 space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setError(null);
              }}
              placeholder="Paste Chinese text here..."
              className="w-full min-h-[200px] rounded-md border border-input bg-background p-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
            />
            <Button
              onClick={handlePasteImport}
              disabled={!pasteText.trim()}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Import
            </Button>
          </TabsContent>

          {/* File Tab */}
          <TabsContent value="file" className="mt-4 space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
                isDragOver
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-8 text-cyan-500 animate-spin mb-2" />
                  <p className="text-sm text-muted-foreground">Processing file...</p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    Supports .txt and .pdf files
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileChange}
              className="hidden"
            />
          </TabsContent>

          {/* Generate Tab */}
          <TabsContent value="generate" className="mt-4 space-y-3">
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Topic
                </label>
                <input
                  type="text"
                  value={topic}
                  data-tour-id="import-dialog-topic"
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. Chinese New Year, pandas, space exploration..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Difficulty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {HSK_LEVELS.map((h) => (
                    <button
                      key={h.value}
                      data-tour-id={h.value === "1" ? "import-dialog-level-beginner" : undefined}
                      onClick={() => {
                        setLevel(h.value);
                        onLevelChange?.(h.value);
                      }}
                      className={`rounded-md border px-2 py-2 text-xs transition-colors ${
                        level === h.value
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <div className="font-medium">{h.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {h.desc.split(" — ")[1]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                data-tour-id="import-dialog-generate-button"
                disabled={!topic.trim() || isGenerating}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Article
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Saved Texts Section */}
        {savedTexts.length > 0 && (
          <div className="border-t border-border pt-3 mt-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <BookOpen className="size-3" />
              Saved Texts
            </h4>
            <div className="space-y-1">
              {savedTexts.map((saved, i) => (
                <div
                  key={saved.savedAt}
                  onClick={() => handleLoadSaved(saved.text)}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 cursor-pointer bg-muted/60 hover:bg-muted transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground/90 truncate">
                      {saved.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {saved.text.length} chars
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSaved(i, e)}
                    className="text-muted-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Warning message (e.g., truncation) */}
        {warning && (
          <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-400">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
