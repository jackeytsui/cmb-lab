"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, BookOpen, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StudentAccessManager } from "@/components/coach/StudentAccessManager";
import { TagBadge } from "@/components/tags/TagBadge";
import { TagManager } from "@/components/tags/TagManager";
import { TagFilter } from "@/components/tags/TagFilter";
import { ErrorAlert } from "@/components/ui/error-alert";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface Student {
  id: string;
  name: string | null;
  email: string;
  accessCount: number;
  tags: Tag[];
}

interface StudentListWithTagsProps {
  students: Student[];
}

/**
 * StudentListWithTags - Enhanced student list with tag display, management, and filtering.
 *
 * Wraps the student list with:
 * - TagFilter bar above the list for filtering by tags
 * - TagBadge display inline on each student row
 * - TagManager popover ("+") for assigning/creating tags
 * - Server-side tag filtering via /api/admin/students?tagIds=
 */
export function StudentListWithTags({ students: initialStudents }: StudentListWithTagsProps) {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [students, setStudents] = useState(initialStudents);
  const [fetchedStudents, setFetchedStudents] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleExpand = (studentId: string) => {
    setExpandedStudentId((prev) => (prev === studentId ? null : studentId));
  };

  // Fetch filtered students from the API when tag filters change
  useEffect(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // No tags selected - use initial server-rendered data
    if (selectedTagIds.length === 0) {
      setFetchedStudents(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function fetchFiltered() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/admin/students?tagIds=${selectedTagIds.join(",")}&limit=100`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          // If API returns error (e.g. 403), fall back to client-side filtering
          console.warn(`Tag filter API returned ${res.status}, using client-side filtering`);
          const clientFiltered = students.filter((s) =>
            s.tags.some((t) => selectedTagIds.includes(t.id))
          );
          setFetchedStudents(clientFiltered);
          setLoading(false);
          return;
        }

        const data = await res.json();
        // Map API response to Student interface
        const mapped: Student[] = (data.students || []).map(
          (s: { id: string; name: string | null; email: string; tags: Tag[] }) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            accessCount:
              students.find((orig) => orig.id === s.id)?.accessCount ?? 0,
            tags: s.tags || [],
          })
        );
        setFetchedStudents(mapped);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Request was cancelled, ignore
        }
        console.error("Error fetching filtered students:", err);
        setError("Failed to load students. Please try again.");
        // Fall back to client-side filtering on error
        const clientFiltered = students.filter((s) =>
          s.tags.some((t) => selectedTagIds.includes(t.id))
        );
        setFetchedStudents(clientFiltered);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchFiltered();

    return () => {
      controller.abort();
    };
  }, [selectedTagIds, students]);

  // Collect all unique tags across all students for the TagManager
  const allTags = useMemo(() => {
    const tagMap = new Map<string, Tag>();
    students.forEach((s) =>
      s.tags.forEach((t) => tagMap.set(t.id, t))
    );
    return Array.from(tagMap.values());
  }, [students]);

  // Display list: use fetched (server-filtered) students if available, otherwise initial data
  const displayStudents = fetchedStudents ?? students;

  // Refresh student data from API after tag assignment changes (no page reload)
  const handleTagsChange = useCallback(async () => {
    setError(null);
    try {
      // Refetch all students from the API to get fresh tag data
      const res = await fetch("/api/admin/students?limit=100");
      if (res.ok) {
        const data = await res.json();
        const mapped: Student[] = (data.students || []).map(
          (s: { id: string; name: string | null; email: string; tags: Tag[] }) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            accessCount:
              students.find((orig) => orig.id === s.id)?.accessCount ?? 0,
            tags: s.tags || [],
          })
        );
        setStudents(mapped);
        // Clear fetched students so the new base data is displayed
        // (if tag filters are active, the useEffect will re-fetch)
        setFetchedStudents(null);
      }
      // Bump refresh key to update TagFilter with any new tags
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Error refreshing student data:", err);
      setError("Failed to refresh student data. Please try again.");
    }
  }, [students]);

  return (
    <div>
      {/* Tag filter bar */}
      <TagFilter
        key={refreshKey}
        selectedTagIds={selectedTagIds}
        onFilterChange={setSelectedTagIds}
      />

      {/* Filtered student count and loading state */}
      <div className="flex items-center gap-2 mb-2 min-h-[1.5rem]">
        {loading && (
          <div className="flex items-center gap-1.5 text-sm text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Filtering...</span>
          </div>
        )}
        {!loading && selectedTagIds.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing {displayStudents.length} of {students.length} students
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <ErrorAlert
          message={error}
          onRetry={handleTagsChange}
          className="mb-2"
        />
      )}

      {/* Student list */}
      <div className="space-y-2">
        {displayStudents.map((student) => {
          const isExpanded = expandedStudentId === student.id;
          const displayName = student.name || student.email.split("@")[0];

          return (
            <div
              key={student.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {/* Student row header */}
              <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <button
                  onClick={() => toggleExpand(student.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  {/* Avatar placeholder */}
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>

                  {/* Student info */}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{displayName}</div>
                    <div className="text-sm text-muted-foreground">{student.email}</div>
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Tags display */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {student.tags.map((tag) => (
                      <TagBadge
                        key={tag.id}
                        name={tag.name}
                        color={tag.color}
                        type={tag.type}
                      />
                    ))}
                    <TagManager
                      studentId={student.id}
                      currentTags={student.tags}
                      allTags={allTags}
                      onTagsChange={handleTagsChange}
                    />
                  </div>

                  {/* Access count badge */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="w-4 h-4" />
                    <span>
                      {student.accessCount} course
                      {student.accessCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Expand/collapse indicator */}
                  <button
                    onClick={() => toggleExpand(student.id)}
                    className="text-muted-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="pt-4">
                        <StudentAccessManager
                          studentId={student.id}
                          studentName={displayName}
                          studentEmail={student.email}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {displayStudents.length === 0 && selectedTagIds.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No students match the selected tag filters.
          </div>
        )}
      </div>
    </div>
  );
}
