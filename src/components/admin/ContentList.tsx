"use client";

import { useState, ReactNode, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentListItem {
  id: string;
  sortOrder: number;
}

interface ContentListProps<T extends ContentListItem> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  emptyMessage: string;
  loading?: boolean;
  onReorder?: (items: { id: string; sortOrder: number }[]) => Promise<void>;
}

// Wrapper for individual sortable items
function SortableItem({
  id,
  index,
  children,
  className,
  disabled,
}: {
  id: string;
  index: number;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { ref, isDragging } = useSortable({ id, index, disabled });

  return (
    <div
      ref={ref}
      data-dragging={isDragging}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4 transition-all",
        isDragging && "scale-[0.98] opacity-50 z-10 relative shadow-xl ring-1 ring-zinc-600",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Generic list component with drag-and-drop reorder capability.
 * Uses @dnd-kit for modern drag interactions.
 */
export function ContentList<T extends ContentListItem>({
  items,
  renderItem,
  emptyMessage,
  loading = false,
  onReorder,
}: ContentListProps<T>) {
  const [localItems, setLocalItems] = useState<T[]>(items);
  const [error, setError] = useState<string | null>(null);
  
  // Use a ref to track localItems for the event handlers to avoid stale closures
  // without forcing re-renders of the DragDropProvider on every state change
  const itemsRef = useRef(localItems);
  useEffect(() => {
    itemsRef.current = localItems;
  }, [localItems]);

  // Keep local items in sync with prop changes (when not dragging ideally, but simple sync here)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Sort items by sortOrder for display
  // We sort on init/update, but during drag we rely on localItems array order
  // Actually, localItems should BE the sorted list.
  // The parent passes 'items'. If we want to sort, we should do it once.
  // But subsequent updates from parent might change sortOrder.
  // Let's ensure localItems is sorted whenever 'items' prop changes.
  useEffect(() => {
    setLocalItems([...items].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [items]);

  const handleDragOver = (event: any) => {
    const { source, target } = event.operation;
    if (!source || !target || source.id === target.id) return;

    const currentItems = itemsRef.current;
    const sourceIndex = currentItems.findIndex((i) => i.id === source.id);
    const targetIndex = currentItems.findIndex((i) => i.id === target.id);

    if (sourceIndex !== -1 && targetIndex !== -1) {
      // Create new array with swapped items
      const newItems = [...currentItems];
      const [movedItem] = newItems.splice(sourceIndex, 1);
      newItems.splice(targetIndex, 0, movedItem);

      // Optimistically update state to animate the move
      setLocalItems(newItems);
    }
  };

  const handleDragEnd = async (event: any) => {
    if (event.canceled || !onReorder) return;

    // At this point, localItems (and itemsRef) matches the visual order from DragOver.
    // We just need to commit this order to the backend.
    // We re-assign sortOrder based on the new index.
    
    const finalItems = itemsRef.current;
    
    // Re-calculate sort orders (0, 1, 2...)
    const updates = finalItems.map((item, index) => ({
      id: item.id,
      sortOrder: index,
    }));

    try {
      // Optimistically update localItems sortOrders
      const newLocalItems = finalItems.map((item, index) => ({
        ...item,
        sortOrder: index,
      }));
      setLocalItems(newLocalItems);
      
      await onReorder(updates);
    } catch (err) {
      console.error("Failed to reorder:", err);
      // Revert to original props
      setLocalItems([...items].sort((a, b) => a.sortOrder - b.sortOrder));
      setError(err instanceof Error ? err.message : "Failed to reorder content. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((n) => (
          <Skeleton
            key={n}
            className="h-16 w-full rounded-lg bg-zinc-700/50"
          />
        ))}
      </div>
    );
  }

  if (localItems.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-8 text-center">
        <p className="text-zinc-400">{emptyMessage}</p>
      </div>
    );
  }

  const content = (
    <div className="space-y-2">
      {error && <ErrorAlert message={error} />}
      
      {localItems.map((item, index) => (
        <SortableItem
          key={item.id}
          id={item.id}
          index={index}
          disabled={!onReorder}
        >
          {/* Handle */}
          {onReorder && (
            <div className="flex shrink-0 cursor-grab items-center text-zinc-500 hover:text-zinc-300 active:cursor-grabbing">
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* Item content */}
          <div className="flex-1 min-w-0">
            {renderItem(item)}
          </div>
        </SortableItem>
      ))}
    </div>
  );

  if (!onReorder) {
    return content;
  }

  return (
    <DragDropProvider
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {content}
    </DragDropProvider>
  );
}