"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatDistanceToNow } from "date-fns";

interface StudentSummary {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
}

interface StudentListProps {
  initialStudents: StudentSummary[];
  initialTotal: number;
}

/**
 * StudentList component - displays student list with search and pagination.
 * Clicking a student row navigates to their detail page.
 */
export function StudentList({
  initialStudents,
  initialTotal,
}: StudentListProps) {
  const router = useRouter();
  const [students, setStudents] = useState<StudentSummary[]>(initialStudents);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch students when search or offset changes
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const res = await fetch(`/api/admin/students?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students);
        setTotal(data.total);
      } else {
        setError("Failed to load student list. Please try again.");
      }
    } catch (err) {
      console.error("Error fetching students:", err);
      setError("Failed to load student list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => {
    // Skip initial load since we have initialStudents
    if (debouncedSearch !== "" || offset !== 0) {
      fetchStudents();
    }
  }, [debouncedSearch, offset, fetchStudents]);

  const handleStudentClick = (studentId: string) => {
    router.push(`/admin/users/${studentId}`);
  };

  const handlePreviousPage = () => {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      {/* Error banner */}
      {error && (
        <ErrorAlert
          message={error}
          onRetry={fetchStudents}
          variant="block"
        />
      )}

      {/* Loading skeleton */}
      {loading && <StudentListSkeleton />}

      {/* Student list */}
      {!loading && !(error && students.length === 0) && (
        <>
          {students.length === 0 ? (
            <EmptyState search={debouncedSearch} />
          ) : (
            <div className="space-y-2">
              {students.map((student) => {
                const displayName =
                  student.name || student.email.split("@")[0];
                const memberSince = formatDistanceToNow(
                  new Date(student.createdAt),
                  { addSuffix: true }
                );

                return (
                  <button
                    key={student.id}
                    onClick={() => handleStudentClick(student.id)}
                    className="w-full flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-zinc-400" />
                      </div>

                      {/* Student info */}
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">
                          {displayName}
                        </div>
                        <div className="text-sm text-zinc-400 truncate">
                          {student.email}
                        </div>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-2 text-sm text-zinc-500 shrink-0">
                      <Clock className="w-4 h-4" />
                      <span className="hidden sm:inline">Joined</span>{" "}
                      {memberSince}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <span className="text-sm text-zinc-400">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of{" "}
                {total} students
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviousPage}
                  disabled={offset === 0}
                  className="p-2 rounded-lg bg-zinc-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-zinc-400 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={offset + limit >= total}
                  className="p-2 rounded-lg bg-zinc-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StudentListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full bg-zinc-700" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
            </div>
          </div>
          <Skeleton className="h-4 w-24 bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="text-center py-16">
      <User className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        {search ? "No students found" : "No students yet"}
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        {search
          ? `No students match "${search}". Try a different search term.`
          : "Students will appear here once they sign up."}
      </p>
    </div>
  );
}
