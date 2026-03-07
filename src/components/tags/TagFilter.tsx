"use client";

import { useState, useEffect } from "react";
import { Filter } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface TagFilterProps {
  selectedTagIds: string[];
  onFilterChange: (tagIds: string[]) => void;
}

/**
 * TagFilter - Clickable tag pill bar for filtering student lists.
 *
 * Fetches all tags on mount and renders as clickable pills.
 * Active filters are visually highlighted with solid background.
 * Implements "Any of" logic: student matches if they have ANY selected tag.
 */
export function TagFilter({ selectedTagIds, onFilterChange }: TagFilterProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTags() {
      try {
        const res = await fetch("/api/admin/tags");
        if (res.ok) {
          const data = await res.json();
          setTags(data.tags || []);
        }
      } catch (error) {
        console.error("Failed to fetch tags:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTags();
  }, []);

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onFilterChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onFilterChange([...selectedTagIds, tagId]);
    }
  };

  const clearFilters = () => {
    onFilterChange([]);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
        <Filter className="w-4 h-4" />
        <span>Loading tags...</span>
      </div>
    );
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
      <span className="text-xs text-zinc-500 shrink-0">Filter by tag:</span>
      {tags.map((tag) => {
        const isActive = selectedTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            className={`
              inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
              transition-all border
              ${
                isActive
                  ? "border-transparent shadow-sm"
                  : "border-transparent hover:border-zinc-600"
              }
            `}
            style={{
              backgroundColor: isActive ? `${tag.color}40` : `${tag.color}1a`,
              color: tag.color,
              borderColor: isActive ? tag.color : undefined,
            }}
          >
            {tag.name}
          </button>
        );
      })}
      {selectedTagIds.length > 0 && (
        <button
          onClick={clearFilters}
          className="text-xs text-zinc-400 hover:text-white transition-colors ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
