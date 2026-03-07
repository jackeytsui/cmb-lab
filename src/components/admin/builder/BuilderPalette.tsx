"use client";

import { useDraggable } from "@dnd-kit/react";
import {
  ListChecks,
  TextCursorInput,
  ArrowLeftRight,
  ListOrdered,
  Mic,
  PenLine,
  Video,
} from "lucide-react";

// ============================================================
// Exercise Type Metadata
// ============================================================

const EXERCISE_TYPES = [
  {
    type: "multiple_choice",
    label: "Multiple Choice",
    icon: ListChecks,
    description: "Single correct answer from options",
  },
  {
    type: "fill_in_blank",
    label: "Fill in Blank",
    icon: TextCursorInput,
    description: "Complete sentences with blanks",
  },
  {
    type: "matching",
    label: "Matching",
    icon: ArrowLeftRight,
    description: "Match pairs of items",
  },
  {
    type: "ordering",
    label: "Ordering",
    icon: ListOrdered,
    description: "Arrange items in correct order",
  },
  {
    type: "audio_recording",
    label: "Audio Recording",
    icon: Mic,
    description: "Record spoken pronunciation",
  },
  {
    type: "free_text",
    label: "Free Text",
    icon: PenLine,
    description: "Open-ended written response",
  },
  {
    type: "video_recording",
    label: "Video Response",
    icon: Video,
    description: "VideoAsk-style coach prompt",
  },
] as const;

// ============================================================
// PaletteItem (draggable)
// ============================================================

interface PaletteItemProps {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

function PaletteItem({ type, label, description, icon: Icon }: PaletteItemProps) {
  const { ref } = useDraggable({
    id: `palette-${type}`,
    data: { type, source: "palette" },
  });

  return (
    <div
      ref={ref}
      className="flex cursor-grab items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3 transition-colors hover:border-zinc-500 hover:bg-zinc-750 active:cursor-grabbing"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-700">
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

// ============================================================
// BuilderPalette
// ============================================================

export function BuilderPalette() {
  return (
    <div className="w-60 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-200">Exercise Types</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Drag onto canvas</p>
      </div>
      <div className="space-y-2">
        {EXERCISE_TYPES.map((item) => (
          <PaletteItem
            key={item.type}
            type={item.type}
            label={item.label}
            description={item.description}
            icon={item.icon}
          />
        ))}
      </div>
    </div>
  );
}
