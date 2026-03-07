"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  AlertTriangle,
} from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface Course {
  id: string;
  title: string;
}

interface AdvancedFiltersProps {
  filters: {
    tagIds?: string[];
    courseId?: string;
    atRisk?: boolean;
  };
  onFiltersChange: (filters: Record<string, string | null>) => void;
}

/**
 * AdvancedFilters - Expandable filter panel for tag, course, and at-risk filtering.
 * Fetches tags and courses on mount. Communicates filter changes via URL param updates.
 */
export function AdvancedFilters({
  filters,
  onFiltersChange,
}: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(
    Boolean(
      filters.tagIds?.length || filters.courseId || filters.atRisk,
    ),
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Fetch tags on mount
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
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Fetch courses on mount
  useEffect(() => {
    async function fetchCourses() {
      try {
        const res = await fetch("/api/admin/courses");
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses || []);
        }
      } catch (error) {
        console.error("Failed to fetch courses:", error);
      } finally {
        setLoadingCourses(false);
      }
    }
    fetchCourses();
  }, []);

  const selectedTagIds = filters.tagIds || [];

  const toggleTag = (tagId: string) => {
    const newIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onFiltersChange({
      tagIds: newIds.length > 0 ? newIds.join(",") : null,
      page: "1",
    });
  };

  const handleCourseChange = (courseId: string) => {
    onFiltersChange({
      courseId: courseId || null,
      page: "1",
    });
  };

  const handleAtRiskToggle = () => {
    onFiltersChange({
      atRisk: filters.atRisk ? null : "true",
      page: "1",
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      tagIds: null,
      courseId: null,
      atRisk: null,
      page: "1",
    });
  };

  const activeFilterCount =
    (selectedTagIds.length > 0 ? 1 : 0) +
    (filters.courseId ? 1 : 0) +
    (filters.atRisk ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="min-w-[20px] rounded-full bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Filter panel */}
      {isExpanded && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-2">
          {/* Tag filter */}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Tags
            </label>
            {loadingTags ? (
              <span className="text-xs text-muted-foreground">Loading tags...</span>
            ) : tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">No tags available</span>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {tags.map((tag) => {
                  const isActive = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        isActive
                          ? "border-transparent shadow-sm"
                          : "border-transparent hover:border-border"
                      }`}
                      style={{
                        backgroundColor: isActive
                          ? `${tag.color}40`
                          : `${tag.color}1a`,
                        color: tag.color,
                        borderColor: isActive ? tag.color : undefined,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Course filter */}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Course
            </label>
            {loadingCourses ? (
              <span className="text-xs text-muted-foreground">
                Loading courses...
              </span>
            ) : (
              <select
                value={filters.courseId || ""}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <option value="">All Courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* At-risk filter */}
          <div>
            <button
              onClick={handleAtRiskToggle}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                filters.atRisk
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              At-risk only (inactive &gt; 7 days)
            </button>
          </div>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
