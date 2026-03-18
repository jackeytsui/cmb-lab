"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminTile {
  id: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  hoverColor: string;
  stat?: string;
  section: "management" | "integrations";
}

const STORAGE_KEY = "admin-dashboard-tile-order";

function loadSavedOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveOrder(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

function orderTiles(tiles: AdminTile[], savedOrder: string[] | null): AdminTile[] {
  if (!savedOrder) return tiles;
  const map = new Map(tiles.map((t) => [t.id, t]));
  const ordered: AdminTile[] = [];
  for (const id of savedOrder) {
    const tile = map.get(id);
    if (tile) {
      ordered.push(tile);
      map.delete(id);
    }
  }
  // Append any new tiles not in saved order
  for (const tile of map.values()) {
    ordered.push(tile);
  }
  return ordered;
}

export function AdminDashboardGrid({ tiles }: { tiles: AdminTile[] }) {
  const [orderedTiles, setOrderedTiles] = useState<AdminTile[]>(() =>
    orderTiles(tiles, loadSavedOrder()),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);

  // Separate into sections for display
  const managementTiles = orderedTiles.filter((t) => t.section === "management");
  const integrationsTiles = orderedTiles.filter((t) => t.section === "integrations");

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      setDraggingId(id);
      dragNodeRef.current = e.currentTarget;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      // Make the dragged element semi-transparent
      requestAnimationFrame(() => {
        if (dragNodeRef.current) {
          dragNodeRef.current.style.opacity = "0.4";
        }
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = "1";
    }
    setDraggingId(null);
    setDragOverId(null);
    dragNodeRef.current = null;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (id !== draggingId) {
        setDragOverId(id);
      }
    },
    [draggingId],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) {
        setDragOverId(null);
        return;
      }
      setOrderedTiles((prev) => {
        const fromIdx = prev.findIndex((t) => t.id === draggingId);
        const toIdx = prev.findIndex((t) => t.id === targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        saveOrder(next.map((t) => t.id));
        return next;
      });
      setDragOverId(null);
    },
    [draggingId],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  return (
    <>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground/80">Management</h2>
          <span className="text-[10px] text-muted-foreground">
            Drag tiles to reorder
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {managementTiles.map((tile) => (
            <TileCard
              key={tile.id}
              tile={tile}
              isDragging={draggingId === tile.id}
              isDragOver={dragOverId === tile.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragLeave={handleDragLeave}
            />
          ))}
        </div>
      </section>

      {integrationsTiles.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-foreground/80">
            Integrations
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrationsTiles.map((tile) => (
              <TileCard
                key={tile.id}
                tile={tile}
                isDragging={draggingId === tile.id}
                isDragOver={dragOverId === tile.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragLeave={handleDragLeave}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TileCard({
  tile,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  tile: AdminTile;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragLeave: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, tile.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, tile.id)}
      onDrop={(e) => onDrop(e, tile.id)}
      onDragLeave={onDragLeave}
      className={cn(
        "relative rounded-lg border bg-card transition-all",
        isDragOver
          ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
          : "border-border hover:border-primary/40 hover:bg-accent",
        isDragging && "opacity-40",
      )}
    >
      {/* Drag handle */}
      <div className="absolute right-2 top-2 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
        <GripVertical className="size-4" />
      </div>
      <Link href={tile.href} className="group block p-6">
        <div className="mb-4">{tile.icon}</div>
        <h3
          className={cn(
            "text-lg font-semibold text-foreground transition-colors",
            tile.hoverColor,
          )}
        >
          {tile.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
        {tile.stat && (
          <p className="mt-2 text-xs text-muted-foreground">{tile.stat}</p>
        )}
      </Link>
    </div>
  );
}
