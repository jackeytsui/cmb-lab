"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Trash2,
  Pencil,
  Plus,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InternalDoc {
  id: string;
  title: string;
  content: Record<string, unknown> | null;
  order: number;
}

// ---------------------------------------------------------------------------
// Seed docs (titles only — admin will fill content)
// ---------------------------------------------------------------------------

const SEED_TITLES = [
  "Course Index",
  "Calendar Preparation",
  "SOP for 1-on-1 Coaching",
  "SOP for Group Coaching",
  "1-on-1 Questions",
];

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("Enter URL:", editor.getAttributes("link").href ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const btnBase =
    "h-7 w-7 flex items-center justify-center rounded text-sm transition-colors hover:bg-muted";
  const btnActive = "bg-muted text-foreground";
  const btnInactive = "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
      {/* Bold */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        className={cn(btnBase, editor.isActive("bold") ? btnActive : btnInactive)}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* Italic */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        className={cn(btnBase, editor.isActive("italic") ? btnActive : btnInactive)}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      {/* Underline */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        className={cn(btnBase, editor.isActive("underline") ? btnActive : btnInactive)}
        title="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Heading 1 */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }}
        className={cn(btnBase, editor.isActive("heading", { level: 1 }) ? btnActive : btnInactive)}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </button>

      {/* Heading 2 */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
        className={cn(btnBase, editor.isActive("heading", { level: 2 }) ? btnActive : btnInactive)}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Font size select */}
      <select
        className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
        title="Font Size"
        onChange={(e) => {
          const val = e.target.value;
          if (val === "small") {
            editor.chain().focus().setMark("textStyle", { fontSize: "0.875em" }).run();
          } else if (val === "large") {
            editor.chain().focus().setMark("textStyle", { fontSize: "1.25em" }).run();
          } else {
            editor.chain().focus().unsetMark("textStyle").run();
          }
        }}
        defaultValue="normal"
      >
        <option value="small">Small</option>
        <option value="normal">Normal</option>
        <option value="large">Large</option>
      </select>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Text color */}
      <label className={cn(btnBase, "cursor-pointer")} title="Text Color">
        <span className="text-xs font-bold" style={{ borderBottom: "2px solid currentColor" }}>A</span>
        <input
          type="color"
          className="sr-only"
          onInput={(e) => {
            editor.chain().focus().setColor((e.target as HTMLInputElement).value).run();
          }}
        />
      </label>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Link */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setLink(); }}
        className={cn(btnBase, editor.isActive("link") ? btnActive : btnInactive)}
        title="Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doc Editor
// ---------------------------------------------------------------------------

function DocEditor({
  doc,
  onSaved,
}: {
  doc: InternalDoc;
  onSaved: (updated: InternalDoc) => void;
}) {
  const [savedIndicator, setSavedIndicator] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
    ],
    content: (doc.content as object) ?? { type: "doc", content: [] },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const json = editor.getJSON();
        try {
          const res = await fetch(`/api/admin/internal-docs/${doc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: json }),
          });
          if (res.ok) {
            const data = await res.json();
            onSaved(data.doc);
            setSavedIndicator(true);
            setTimeout(() => setSavedIndicator(false), 2000);
          }
        } catch (err) {
          console.error("Auto-save failed:", err);
        }
      }, 1500);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[400px] prose prose-sm dark:prose-invert max-w-none p-4 focus:outline-none",
      },
    },
  });

  // Update content when doc changes (tab switch)
  useEffect(() => {
    if (!editor) return;
    const incoming = (doc.content as object) ?? { type: "doc", content: [] };
    const current = editor.getJSON();
    if (JSON.stringify(incoming) !== JSON.stringify(current)) {
      editor.commands.setContent(incoming);
    }
  }, [doc.id, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative rounded-md border border-border">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      {savedIndicator && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-400">
          <Check className="h-3 w-3" />
          Saved
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------------

export function InternalDocsClient() {
  const [docs, setDocs] = useState<InternalDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [seeded, setSeeded] = useState(false);

  // ---- Fetch docs ----
  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/internal-docs");
      if (!res.ok) return;
      const data = await res.json();
      setDocs(data.docs ?? []);
      if (data.docs?.length > 0 && !activeId) {
        setActiveId(data.docs[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  // ---- Seed initial docs if empty ----
  const seedDocs = useCallback(async () => {
    for (let i = 0; i < SEED_TITLES.length; i++) {
      await fetch("/api/admin/internal-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: SEED_TITLES[i], order: i }),
      });
    }
    setSeeded(true);
    await fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    fetchDocs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && docs.length === 0 && !seeded) {
      seedDocs();
    }
  }, [loading, docs.length, seeded, seedDocs]);

  // ---- Create new doc ----
  const createDoc = async () => {
    const res = await fetch("/api/admin/internal-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Document", order: docs.length }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const newDoc = data.doc as InternalDoc;
    setDocs((prev) => [...prev, newDoc]);
    setActiveId(newDoc.id);
  };

  // ---- Delete doc ----
  const deleteDoc = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/admin/internal-docs/${id}`, { method: "DELETE" });
    const remaining = docs.filter((d) => d.id !== id);
    setDocs(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
  };

  // ---- Rename doc ----
  const startRename = (doc: InternalDoc) => {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) return;
    const res = await fetch(`/api/admin/internal-docs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setDocs((prev) => prev.map((d) => (d.id === id ? data.doc : d)));
    }
    setRenamingId(null);
  };

  const handleDocSaved = useCallback((updated: InternalDoc) => {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }, []);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Internal Docs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin-only reference documents for team use.
          </p>
        </div>
        <Button size="sm" onClick={createDoc} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Document
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-muted-foreground">
          <p className="text-sm">No documents yet.</p>
          <button
            onClick={createDoc}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Create your first document
          </button>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex flex-wrap items-end gap-0 border-b border-border">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "group relative flex items-center gap-1 cursor-pointer px-4 py-2 text-sm transition-colors select-none",
                  activeId === doc.id
                    ? "border-b-2 border-primary text-foreground font-medium -mb-px bg-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t"
                )}
                onClick={() => {
                  if (renamingId !== doc.id) setActiveId(doc.id);
                }}
              >
                {renamingId === doc.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(doc.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="h-6 w-32 text-xs px-1.5"
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(doc.id)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{doc.title}</span>
                    <div className="ml-1 hidden items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startRename(doc); }}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-muted"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Editor */}
          {activeDoc ? (
            <DocEditor key={activeDoc.id} doc={activeDoc} onSaved={handleDocSaved} />
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Select a document above.
            </div>
          )}
        </>
      )}
    </div>
  );
}
