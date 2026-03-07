"use client";

import { X } from "lucide-react";

/**
 * Predefined tag color palette for consistent tag styling.
 */
export const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
] as const;

interface TagBadgeProps {
  name: string;
  color: string;
  type: "coach" | "system";
  onRemove?: () => void;
}

/**
 * TagBadge - Inline color-coded tag pill.
 *
 * - Coach tags: solid border, filled style
 * - System tags: dashed border with "GHL" label for distinction
 * - Background uses tag color at 20% opacity, text in tag color
 * - Optional remove button on hover
 */
export function TagBadge({ name, color, type, onRemove }: TagBadgeProps) {
  const isSystem = type === "system";

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        transition-colors group whitespace-nowrap
        ${isSystem ? "border border-dashed" : "border border-solid"}
      `}
      style={{
        backgroundColor: `${color}33`, // 20% opacity
        color: color,
        borderColor: `${color}66`, // 40% opacity
      }}
    >
      {isSystem && (
        <span className="text-[10px] font-semibold opacity-70">GHL</span>
      )}
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-80"
          aria-label={`Remove tag ${name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
