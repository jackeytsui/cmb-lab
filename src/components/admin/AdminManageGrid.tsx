"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewAsPanel } from "@/components/admin/ViewAsPanel";
import { TranscriptLimitsWidget } from "@/components/admin/TranscriptLimitsWidget";

export interface PortalItem {
  id: string;
  title: string;
  href: string;
  description: string;
}

export interface PortalSection {
  id: string;
  title: string;
  items?: PortalItem[];
  /** If set, renders a built-in widget instead of link tiles */
  widget?: "view-as" | "transcript-limits";
}

const WIDGET_MAP: Record<string, React.FC> = {
  "view-as": ViewAsPanel,
  "transcript-limits": TranscriptLimitsWidget,
};

const STORAGE_KEY = "admin-manage-section-order";
const ITEM_STORAGE_PREFIX = "admin-manage-items-";

function loadSectionOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSectionOrder(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

function loadItemOrder(sectionId: string): string[] | null {
  try {
    const raw = localStorage.getItem(ITEM_STORAGE_PREFIX + sectionId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveItemOrder(sectionId: string, ids: string[]) {
  try {
    localStorage.setItem(ITEM_STORAGE_PREFIX + sectionId, JSON.stringify(ids));
  } catch {}
}

function reorder<T extends { id: string }>(items: T[], savedOrder: string[] | null): T[] {
  if (!savedOrder) return items;
  const map = new Map(items.map((t) => [t.id, t]));
  const ordered: T[] = [];
  for (const id of savedOrder) {
    const item = map.get(id);
    if (item) {
      ordered.push(item);
      map.delete(id);
    }
  }
  for (const item of map.values()) ordered.push(item);
  return ordered;
}

export function AdminManageGrid({ sections: initialSections }: { sections: PortalSection[] }) {
  const [sections, setSections] = useState<PortalSection[]>(() => {
    const ordered = reorder(initialSections, loadSectionOrder());
    return ordered.map((s) => ({
      ...s,
      items: s.items ? reorder(s.items, loadItemOrder(s.id)) : undefined,
    }));
  });

  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const dragSectionRef = useRef<HTMLElement | null>(null);

  const handleSectionDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `section:${id}`);
      setDraggingSectionId(id);
      dragSectionRef.current = e.currentTarget;
      requestAnimationFrame(() => {
        if (dragSectionRef.current) dragSectionRef.current.style.opacity = "0.4";
      });
    },
    [],
  );

  const handleSectionDragEnd = useCallback(() => {
    if (dragSectionRef.current) dragSectionRef.current.style.opacity = "1";
    setDraggingSectionId(null);
    setDragOverSectionId(null);
    dragSectionRef.current = null;
  }, []);

  const handleSectionDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (id !== draggingSectionId) setDragOverSectionId(id);
    },
    [draggingSectionId],
  );

  const handleSectionDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      if (!draggingSectionId || draggingSectionId === targetId) {
        setDragOverSectionId(null);
        return;
      }
      setSections((prev) => {
        const fromIdx = prev.findIndex((s) => s.id === draggingSectionId);
        const toIdx = prev.findIndex((s) => s.id === targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        saveSectionOrder(next.map((s) => s.id));
        return next;
      });
      setDragOverSectionId(null);
    },
    [draggingSectionId],
  );

  const handleItemReorder = useCallback(
    (sectionId: string, fromId: string, toId: string) => {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId || !s.items) return s;
          const fromIdx = s.items.findIndex((i) => i.id === fromId);
          const toIdx = s.items.findIndex((i) => i.id === toId);
          if (fromIdx === -1 || toIdx === -1) return s;
          const next = [...s.items];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          saveItemOrder(sectionId, next.map((i) => i.id));
          return { ...s, items: next };
        }),
      );
    },
    [],
  );

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground text-right">
        Drag sections or tiles to reorder
      </p>
      {sections.map((section) => (
        <DraggableSection
          key={section.id}
          section={section}
          isDragging={draggingSectionId === section.id}
          isDragOver={dragOverSectionId === section.id}
          onDragStart={handleSectionDragStart}
          onDragEnd={handleSectionDragEnd}
          onDragOver={handleSectionDragOver}
          onDrop={handleSectionDrop}
          onItemReorder={handleItemReorder}
        />
      ))}
    </div>
  );
}

function DraggableSection({
  section,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onItemReorder,
}: {
  section: PortalSection;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onItemReorder: (sectionId: string, fromId: string, toId: string) => void;
}) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const dragItemRef = useRef<HTMLElement | null>(null);

  const handleItemDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `item:${id}`);
      setDraggingItemId(id);
      dragItemRef.current = e.currentTarget;
      requestAnimationFrame(() => {
        if (dragItemRef.current) dragItemRef.current.style.opacity = "0.4";
      });
    },
    [],
  );

  const handleItemDragEnd = useCallback(() => {
    if (dragItemRef.current) dragItemRef.current.style.opacity = "1";
    setDraggingItemId(null);
    setDragOverItemId(null);
    dragItemRef.current = null;
  }, []);

  const handleItemDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (id !== draggingItemId) setDragOverItemId(id);
    },
    [draggingItemId],
  );

  const handleItemDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggingItemId && draggingItemId !== targetId) {
        onItemReorder(section.id, draggingItemId, targetId);
      }
      setDragOverItemId(null);
    },
    [draggingItemId, onItemReorder, section.id],
  );

  const isWidget = !!section.widget;
  const WidgetComponent = section.widget ? WIDGET_MAP[section.widget] : null;

  return (
    <div
      onDragOver={(e) => onDragOver(e, section.id)}
      onDrop={(e) => onDrop(e, section.id)}
      className={cn(
        "rounded-xl border bg-card transition-all",
        isDragOver
          ? "border-primary ring-2 ring-primary/20"
          : "border-border",
        isDragging && "opacity-40",
        !isWidget && "p-5",
      )}
    >
      {isWidget && WidgetComponent ? (
        /* Widget section: render the widget with a drag handle overlay */
        <div className="relative">
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              onDragStart(e, section.id);
            }}
            onDragEnd={onDragEnd}
            className="absolute right-2 top-2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
            title="Drag to reorder"
          >
            <GripVertical className="size-4" />
          </div>
          <WidgetComponent />
        </div>
      ) : (
        /* Link-tile section */
        <>
          <div
            draggable
            onDragStart={(e) => onDragStart(e, section.id)}
            onDragEnd={onDragEnd}
            className="mb-3 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h2>
            <div className="text-muted-foreground/40 hover:text-muted-foreground">
              <GripVertical className="size-4" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(section.items ?? []).map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleItemDragStart(e, item.id)}
                onDragEnd={handleItemDragEnd}
                onDragOver={(e) => handleItemDragOver(e, item.id)}
                onDrop={(e) => handleItemDrop(e, item.id)}
                onDragLeave={() => setDragOverItemId(null)}
                className={cn(
                  "relative rounded-lg border bg-background/50 transition-all cursor-grab active:cursor-grabbing",
                  dragOverItemId === item.id
                    ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                    : "border-border/70 hover:border-primary/40 hover:bg-background",
                  draggingItemId === item.id && "opacity-40",
                )}
              >
                <div className="absolute right-1.5 top-1.5 text-muted-foreground/30 pointer-events-none">
                  <GripVertical className="size-3.5" />
                </div>
                <Link
                  href={item.href}
                  draggable={false}
                  className="block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg"
                >
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
