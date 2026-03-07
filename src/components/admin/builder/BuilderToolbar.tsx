"use client";

import { Undo2, Redo2, Save, Send, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ============================================================
// Props
// ============================================================

interface BuilderToolbarProps {
  title: string;
  status: "draft" | "published" | "archived";
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onTitleChange: (title: string) => void;
}

// ============================================================
// Status badge styling
// ============================================================

const STATUS_CONFIG: Record<
  BuilderToolbarProps["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-zinc-700 text-zinc-300",
  },
  published: {
    label: "Published",
    className: "bg-emerald-900/60 text-emerald-400",
  },
  archived: {
    label: "Archived",
    className: "bg-yellow-900/60 text-yellow-400",
  },
};

// ============================================================
// Component
// ============================================================

export function BuilderToolbar({
  title,
  status,
  canUndo,
  canRedo,
  isDirty,
  isSaving,
  onUndo,
  onRedo,
  onSaveDraft,
  onPublish,
  onDuplicate,
  onTitleChange,
}: BuilderToolbarProps) {
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-zinc-700 bg-zinc-900/80 px-4 py-3 backdrop-blur">
      {/* Left section: Title + Status badge */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-auto border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-white hover:border-zinc-600 focus:border-zinc-500 focus:bg-zinc-800"
          placeholder="Untitled Practice Set"
        />
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
            statusConfig.className
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Center section: Undo / Redo */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="text-zinc-400 hover:text-white disabled:text-zinc-600"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="text-zinc-400 hover:text-white disabled:text-zinc-600"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Right section: Duplicate / Save Draft / Publish */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDuplicate}
          className="border-zinc-600 text-zinc-300 hover:text-white"
        >
          <Copy className="h-4 w-4" />
          Duplicate
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty}
          className="border-zinc-600 text-zinc-300 hover:text-white"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Draft
        </Button>

        <Button
          size="sm"
          onClick={onPublish}
          disabled={isSaving}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Publish
        </Button>
      </div>
    </div>
  );
}
