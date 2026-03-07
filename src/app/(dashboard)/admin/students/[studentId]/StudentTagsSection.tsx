"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { TagBadge } from "@/components/tags/TagBadge";
import { TagManager } from "@/components/tags/TagManager";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface StudentTagsSectionProps {
  studentId: string;
}

/**
 * StudentTagsSection - Shows all tags assigned to a student with a TagManager for editing.
 * Used on the admin student detail page.
 */
export function StudentTagsSection({ studentId }: StudentTagsSectionProps) {
  const [currentTags, setCurrentTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tagsRes, allTagsRes] = await Promise.all([
        fetch(`/api/students/${studentId}/tags`),
        fetch("/api/admin/tags"),
      ]);

      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setCurrentTags(data.tags || []);
      }
      if (allTagsRes.ok) {
        const data = await allTagsRes.json();
        setAllTags(data.tags || []);
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTagsChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading tags...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {currentTags.length === 0 && (
        <span className="text-sm text-zinc-500">No tags assigned</span>
      )}
      {currentTags.map((tag) => (
        <TagBadge
          key={tag.id}
          name={tag.name}
          color={tag.color}
          type={tag.type}
          onRemove={async () => {
            await fetch(`/api/students/${studentId}/tags`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tagId: tag.id }),
            });
            handleTagsChange();
          }}
        />
      ))}
      <TagManager
        studentId={studentId}
        currentTags={currentTags}
        allTags={allTags}
        onTagsChange={handleTagsChange}
      />
    </div>
  );
}
