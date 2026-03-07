"use client";

import { useState, useMemo, useCallback } from "react";
import { GripVertical } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { OrderingDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface OrderingRendererProps {
  definition: OrderingDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { orderedIds: string[] }) => void;
  disabled?: boolean;
  savedAnswer?: { orderedIds: string[] };
}

// ============================================================
// Deterministic shuffle (seeded PRNG, same as ExercisePreview)
// ============================================================

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================
// SortableItem sub-component
// ============================================================

interface SortableItemProps {
  item: OrderingDefinition["items"][number];
  index: number;
  disabled: boolean;
  forceLanguage: "cantonese" | "mandarin" | undefined;
}

function SortableItem({ item, index, disabled, forceLanguage }: SortableItemProps) {
  const { ref, isDragging } = useSortable({
    id: item.id,
    index,
    type: "ordering-item",
    group: "ordering",
    disabled,
  });

  return (
    <div
      ref={ref}
      data-dragging={isDragging}
      className={`flex items-center gap-3 rounded-lg bg-zinc-800 px-4 py-3 transition ${
        isDragging ? "scale-[0.98] opacity-50" : ""
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"}`}
    >
      {/* Grip handle */}
      <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />

      {/* Position number */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-400">
        {index + 1}
      </span>

      {/* Item text */}
      <span className="text-sm text-zinc-200">
        <PhoneticText forceLanguage={forceLanguage}>{item.text}</PhoneticText>
      </span>
    </div>
  );
}

// ============================================================
// OrderingRenderer
// ============================================================

export function OrderingRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
  savedAnswer,
}: OrderingRendererProps) {
  // Initial shuffle, memoized so it doesn't re-shuffle on re-render
  const initialOrder = useMemo(() => {
    if (savedAnswer?.orderedIds) {
      // Map saved IDs back to objects
      return savedAnswer.orderedIds
        .map((id) => definition.items.find((item) => item.id === id))
        .filter((item): item is OrderingDefinition["items"][0] => !!item);
    }
    return shuffleArray(definition.items, definition.items.length * 11);
  }, [definition.items, savedAnswer]);

  const [orderedItems, setOrderedItems] =
    useState<OrderingDefinition["items"]>(initialOrder);

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  // ----------------------------------------------------------
  // Drag handler: reorder items on drag over (same pattern as builder)
  // ----------------------------------------------------------

  const handleDragOver = useCallback(
    (event: any) => {
      const { source, target } = event.operation;
      if (!source || !target) return;

      setOrderedItems((prev) => {
        const sourceIndex = prev.findIndex((item) => item.id === source.id);
        const targetIndex = prev.findIndex((item) => item.id === target.id);

        if (
          sourceIndex === -1 ||
          targetIndex === -1 ||
          sourceIndex === targetIndex
        ) {
          return prev;
        }

        // Move item from sourceIndex to targetIndex
        const next = [...prev];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    },
    []
  );

  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------

  function handleSubmit() {
    if (disabled) return;
    const orderedIds = orderedItems.map((item) => item.id);
    onSubmit({ orderedIds });
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Instruction */}
      <p className="text-sm text-zinc-400">
        Drag items to arrange in the correct order
      </p>

      {/* Sortable list */}
      <DragDropProvider onDragOver={handleDragOver}>
        <div className="space-y-2">
          {orderedItems.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              disabled={disabled}
              forceLanguage={forceLanguage}
            />
          ))}
        </div>
      </DragDropProvider>

      {/* Submit button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handleSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Order
        </button>
      </div>
    </div>
  );
}
