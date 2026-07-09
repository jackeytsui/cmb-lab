"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import FontSize from "@tiptap/extension-text-style/font-size";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Trash2,
  Pencil,
  Plus,
  Check,
  X,
  Highlighter,
  List,
  ListOrdered,
  Strikethrough,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  TableColumnsSplit,
  TableRowsSplit,
  Paperclip,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Attachment {
  name: string;
  url: string;
}

interface InternalDoc {
  id: string;
  title: string;
  content: Record<string, unknown> | null;
  attachments: Attachment[] | null;
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

const FONT_SIZE_OPTIONS = [
  { label: "Small", value: "0.875em" },
  { label: "Normal", value: null },
  { label: "Large", value: "1.125em" },
  { label: "XL", value: "1.25em" },
];

const TABLE_COLORS = [
  "#ffffff",
  "#f8fafc",
  "#e2e8f0",
  "#cbd5e1",
  "#fef3c7",
  "#fde68a",
  "#d1fae5",
  "#bfdbfe",
  "#fbcfe8",
];

const TableCellWithBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute("data-background-color") ||
          (element as HTMLElement).style.backgroundColor ||
          null,
        renderHTML: (attributes) =>
          attributes.backgroundColor
            ? {
                "data-background-color": attributes.backgroundColor,
                style: `background-color: ${attributes.backgroundColor}`,
              }
            : {},
      },
    };
  },
});

const TableHeaderWithBackground = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute("data-background-color") ||
          (element as HTMLElement).style.backgroundColor ||
          null,
        renderHTML: (attributes) =>
          attributes.backgroundColor
            ? {
                "data-background-color": attributes.backgroundColor,
                style: `background-color: ${attributes.backgroundColor}`,
              }
            : {},
      },
    };
  },
});

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
  const isInTable = editor.isActive("table");

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
      {/* Inline formatting */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
        className={cn(btnBase, editor.isActive("bold") ? btnActive : btnInactive)}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
        className={cn(btnBase, editor.isActive("italic") ? btnActive : btnInactive)}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleUnderline().run();
        }}
        className={cn(btnBase, editor.isActive("underline") ? btnActive : btnInactive)}
        title="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleStrike().run();
        }}
        className={cn(btnBase, editor.isActive("strike") ? btnActive : btnInactive)}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().unsetAllMarks().clearNodes().run();
        }}
        className={cn(btnBase, btnInactive)}
        title="Clear formatting"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Headings */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 1 }).run();
        }}
        className={cn(btnBase, editor.isActive("heading", { level: 1 }) ? btnActive : btnInactive)}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 2 }).run();
        }}
        className={cn(btnBase, editor.isActive("heading", { level: 2 }) ? btnActive : btnInactive)}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 3 }).run();
        }}
        className={cn(btnBase, editor.isActive("heading", { level: 3 }) ? btnActive : btnInactive)}
        title="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Lists */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBulletList().run();
        }}
        className={cn(btnBase, editor.isActive("bulletList") ? btnActive : btnInactive)}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleOrderedList().run();
        }}
        className={cn(btnBase, editor.isActive("orderedList") ? btnActive : btnInactive)}
        title="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <select
        className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
        title="Font Size"
        onChange={(e) => {
          const val = e.target.value;
          if (val === "normal") {
            editor.chain().focus().unsetFontSize().run();
          } else {
            editor.chain().focus().setFontSize(val).run();
          }
        }}
        defaultValue="normal"
      >
        <option value="0.875em">Small</option>
        <option value="normal">Normal</option>
        <option value="1.125em">Large</option>
        <option value="1.25em">XL</option>
      </select>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Text color */}
      <div className="flex items-center gap-0.5">
        <label className={cn(btnBase, "cursor-pointer")} title="Text Color">
          <span className="text-xs font-bold" style={{ borderBottom: "2px solid currentColor" }}>
            A
          </span>
          <input
            type="color"
            className="sr-only"
            onInput={(e) => {
              editor.chain().focus().setColor((e.target as HTMLInputElement).value).run();
            }}
          />
        </label>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().unsetColor().run();
          }}
          className={cn("rounded px-2 py-1 text-[10px] uppercase tracking-wide", btnInactive)}
          title="Remove text color"
        >
          None
        </button>
      </div>

      {/* Highlight color */}
      <div className="flex items-center gap-0.5">
        <label
          className={cn(
            btnBase,
            "cursor-pointer",
            editor.isActive("highlight") ? btnActive : btnInactive,
          )}
          title="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <input
            type="color"
            className="sr-only"
            defaultValue="#fef08a"
            onInput={(e) => {
              editor.chain().focus().setHighlight({ color: (e.target as HTMLInputElement).value }).run();
            }}
          />
        </label>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().unsetHighlight().run();
          }}
          className={cn("rounded px-2 py-1 text-[10px] uppercase tracking-wide", btnInactive)}
          title="Remove highlight"
        >
          None
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Link + media */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setLink();
        }}
        className={cn(btnBase, editor.isActive("link") ? btnActive : btnInactive)}
        title="Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          const url = window.prompt("Image URL");
          if (url) {
            editor.chain().focus().setImage({ src: url, alt: "Inserted image" }).run();
          }
        }}
        className={cn(btnBase, btnInactive)}
        title="Insert image"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Tables */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}
        className={cn(btnBase, editor.isActive("table") ? btnActive : btnInactive)}
        title="Insert table"
      >
        <Table2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeaderRow().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Toggle header row"
      >
        Hdr
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().addRowBefore().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Add row above"
      >
        <TableRowsSplit className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().addRowAfter().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Add row below"
      >
        <TableRowsSplit className="h-3.5 w-3.5 rotate-180" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().addColumnBefore().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Add column left"
      >
        <TableColumnsSplit className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().addColumnAfter().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Add column right"
      >
        <TableColumnsSplit className="h-3.5 w-3.5 rotate-180" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().mergeCells().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Merge cells"
      >
        <TableCellsMerge className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().splitCell().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Split cell"
      >
        <TableCellsSplit className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().deleteRow().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Delete row"
      >
        -R
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().deleteColumn().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Delete column"
      >
        -C
      </button>
      <button
        type="button"
        disabled={!isInTable}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().deleteTable().run();
        }}
        className={cn(btnBase, isInTable ? btnInactive : "cursor-not-allowed opacity-40")}
        title="Delete table"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {isInTable && (
        <>
          <div className="mx-1 h-5 w-px bg-border" />
          <select
            className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
            title="Cell background"
            onChange={(e) => {
              const value = e.target.value;
              editor.chain().focus().setCellAttribute("backgroundColor", value === "none" ? null : value).run();
            }}
            defaultValue="none"
          >
            <option value="none">Cell None</option>
            {TABLE_COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF Attachments Panel (admin)
// ---------------------------------------------------------------------------

function PdfAttachmentsPanel({
  docId,
  attachments,
  onUpdated,
}: {
  docId: string;
  attachments: Attachment[];
  onUpdated: (attachments: Attachment[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/internal-docs/${docId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onUpdated(data.doc.attachments ?? []);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm("Remove this PDF?")) return;
    try {
      const res = await fetch(
        `/api/admin/internal-docs/${docId}/attachments?url=${encodeURIComponent(url)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      onUpdated(data.doc.attachments ?? []);
      if (previewUrl === `/api/internal-docs/pdf?url=${encodeURIComponent(url)}`) {
        setPreviewUrl(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Attachments
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 text-xs h-7"
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
            ) : (
              <><Plus className="h-3.5 w-3.5" /> Upload PDF</>
            )}
          </Button>
        </div>
      </div>

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No PDFs attached yet.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const proxyUrl = `/api/internal-docs/pdf?url=${encodeURIComponent(att.url)}`;
            const isOpen = previewUrl === proxyUrl;
            return (
              <div key={att.url} className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(isOpen ? null : proxyUrl)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-xs text-left hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{att.name}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground text-[10px]">
                      {isOpen ? "hide" : "preview"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(att.url)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isOpen && (
                  <iframe
                    src={proxyUrl}
                    className="w-full rounded border border-border"
                    style={{ height: "600px" }}
                    title={att.name}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
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
      FontSize,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your document here…" }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "inline max-w-full align-middle rounded-md my-1",
        },
      }),
      Table.configure({ resizable: true, cellMinWidth: 80 }),
      TableRow,
      TableHeaderWithBackground,
      TableCellWithBackground,
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
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith("image/"));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;

        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = typeof reader.result === "string" ? reader.result : "";
          if (!src) return;
          const image = view.state.schema.nodes.image.create({
            src,
            alt: file.name,
            title: file.name,
          });
          const tr = view.state.tr.replaceSelectionWith(image);
          view.dispatch(tr.scrollIntoView());
        };
        reader.readAsDataURL(file);
        return true;
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

  const handleAttachmentsUpdated = useCallback(
    (attachments: Attachment[]) => {
      onSaved({ ...doc, attachments });
    },
    [doc, onSaved]
  );

  return (
    <div className="space-y-4">
      <div className="relative rounded-md border border-border">
        <EditorToolbar editor={editor} />
        {/* Contain an over-wide (e.g. pasted) table inside the editor so it
            scrolls here instead of blowing out the page layout. Wraps only the
            content, so the toolbar's dropdowns are never clipped. */}
        <div className="overflow-x-auto">
          <EditorContent editor={editor} />
        </div>
        {savedIndicator && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-400">
            <Check className="h-3 w-3" />
            Saved
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <PdfAttachmentsPanel
          docId={doc.id}
          attachments={doc.attachments ?? []}
          onUpdated={handleAttachmentsUpdated}
        />
      </div>
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
