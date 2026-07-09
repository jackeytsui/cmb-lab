"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import FontSize from "@tiptap/extension-text-style/font-size";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

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
// Read-only doc viewer
// ---------------------------------------------------------------------------

function DocViewer({ doc }: { doc: InternalDoc }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: true }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "inline max-w-full align-middle rounded-md my-1",
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: (doc.content as object) ?? { type: "doc", content: [] },
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none p-4 focus:outline-none",
      },
    },
  });

  // Update content on tab switch
  useEffect(() => {
    if (!editor) return;
    const incoming = (doc.content as object) ?? { type: "doc", content: [] };
    editor.commands.setContent(incoming);
  }, [doc.id, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit-to-width: coaches read the whole table without horizontal scrolling.
  // Any table wider than the available width is scaled down to fit via CSS
  // `zoom` (which shrinks the layout box too, so no leftover width / scrollbar).
  // The table's own column widths are never modified — this only affects display.
  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;

    const fitTables = () => {
      const style = window.getComputedStyle(root);
      const padX =
        parseFloat(style.paddingLeft || "0") +
        parseFloat(style.paddingRight || "0");
      const available = root.clientWidth - padX;
      if (available <= 0) return;
      root.querySelectorAll("table").forEach((el) => {
        const table = el as HTMLElement;
        // Reset before measuring so re-runs (resize / tab switch) recompute.
        table.style.removeProperty("zoom");
        const natural = table.offsetWidth;
        if (natural > available) {
          table.style.setProperty("zoom", String(available / natural));
        }
      });
    };

    const raf = requestAnimationFrame(fitTables);
    window.addEventListener("resize", fitTables);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fitTables);
    };
  }, [doc.id, editor]);

  const attachments = doc.attachments ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border">
        <EditorContent editor={editor} />
      </div>

      {attachments.length > 0 && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Attachments
          </h3>
          <div className="space-y-1.5">
            {attachments.map((att) => {
              const proxyUrl = `/api/internal-docs/pdf?url=${encodeURIComponent(att.url)}`;
              const isOpen = previewUrl === proxyUrl;
              return (
                <div key={att.url} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(isOpen ? null : proxyUrl)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{att.name}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground text-[10px]">
                      {isOpen ? "hide" : "preview"}
                    </span>
                  </button>
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
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export function CoachInternalDocsClient() {
  const [docs, setDocs] = useState<InternalDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/internal-docs")
      .then((r) => r.json())
      .then((data) => {
        const list: InternalDoc[] = data.docs ?? [];
        setDocs(list);
        if (list.length > 0) setActiveId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No documents available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Internal Docs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reference documents for coaching.</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-end gap-0 border-b border-border">
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setActiveId(doc.id)}
            className={cn(
              "px-4 py-2 text-sm transition-colors select-none",
              activeId === doc.id
                ? "border-b-2 border-primary text-foreground font-medium -mb-px bg-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t"
            )}
          >
            {doc.title}
          </button>
        ))}
      </div>

      {activeDoc ? (
        <DocViewer key={activeDoc.id} doc={activeDoc} />
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Select a document above.
        </div>
      )}
    </div>
  );
}
