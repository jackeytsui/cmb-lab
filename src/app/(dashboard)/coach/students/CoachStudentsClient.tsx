"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Star,
  ExternalLink,
  Loader2,
  ChevronDown,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentRow {
  id: string;
  name: string | null;
  email: string;
  assignedCoachId: string | null;
  coachName: string | null;
  coachEmail: string | null;
  createdAt: string;
  avgRating1on1: number | null;
  avgRatingInnerCircle: number | null;
  ratingCount1on1: number;
  ratingCountInnerCircle: number;
}

interface Coach {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  currentUserId: string;
  isAdmin: boolean;
  coaches: Coach[];
}

function StarRating({ value, count }: { value: number | null; count: number }) {
  if (value === null || count === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="size-3 fill-amber-400 text-amber-400" />
      <span className="text-sm font-medium text-foreground">
        {value.toFixed(1)}
      </span>
      <span className="text-[10px] text-muted-foreground">({count})</span>
    </span>
  );
}

export function CoachStudentsClient({ currentUserId, isAdmin, coaches }: Props) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState<string>(
    isAdmin ? "all" : "mine",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCoachId, setBulkCoachId] = useState<string>("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchStudents = useCallback(
    async (searchQuery = "", coachId = coachFilter) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (coachId === "mine") {
          params.set("myStudents", "true");
        } else if (coachId && coachId !== "all") {
          params.set("coachId", coachId);
        }
        const res = await fetch(
          `/api/coach/students/with-ratings?${params.toString()}`,
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setStudents(data.students);
      } catch {
        setError("Failed to load students. Please try refreshing.");
      } finally {
        setLoading(false);
      }
    },
    [coachFilter],
  );

  useEffect(() => {
    fetchStudents(search, coachFilter);
  }, [coachFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        fetchStudents(value, coachFilter);
      }, 400);
    },
    [fetchStudents, coachFilter],
  );

  const handleCoachFilterChange = useCallback((value: string) => {
    setCoachFilter(value);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  }, [selectedIds.size, students]);

  const handleBulkAssign = useCallback(async () => {
    if (selectedIds.size === 0 || !bulkCoachId) return;
    setBulkAssigning(true);
    try {
      const res = await fetch("/api/admin/students/bulk-assign-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          coachId: bulkCoachId === "unassign" ? null : bulkCoachId,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      setSelectedIds(new Set());
      setShowBulkPanel(false);
      setBulkCoachId("");
      await fetchStudents(search, coachFilter);
    } catch {
      setError("Failed to bulk assign. Please try again.");
    } finally {
      setBulkAssigning(false);
    }
  }, [selectedIds, bulkCoachId, fetchStudents, search, coachFilter]);

  // Group students by coach for admin view
  const groupedByCoach = useMemo(() => {
    if (!isAdmin || coachFilter !== "all") return null;
    const map = new Map<string, { coach: Coach | null; students: StudentRow[] }>();
    for (const s of students) {
      const key = s.assignedCoachId || "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          coach: s.assignedCoachId
            ? { id: s.assignedCoachId, name: s.coachName, email: s.coachEmail || "" }
            : null,
          students: [],
        });
      }
      map.get(key)!.students.push(s);
    }
    // Sort: coaches with names first, unassigned last
    const entries = Array.from(map.entries());
    entries.sort(([, a], [, b]) => {
      if (!a.coach) return 1;
      if (!b.coach) return -1;
      return (a.coach.name || a.coach.email).localeCompare(b.coach.name || b.coach.email);
    });
    return entries;
  }, [students, isAdmin, coachFilter]);

  return (
    <div>
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {isAdmin
            ? "View all students, manage coach assignments, and track coaching ratings."
            : "View your assigned students and their coaching session ratings."}
        </p>
      </header>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); fetchStudents("", coachFilter); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Coach filter (admin only) */}
        {isAdmin && (
          <select
            value={coachFilter}
            onChange={(e) => handleCoachFilterChange(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All coaches</option>
            <option value="mine">My students</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        )}

        {/* Bulk assign button (admin only) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowBulkPanel((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              showBulkPanel
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-foreground hover:bg-accent",
            )}
          >
            <UserCheck className="size-4" />
            Bulk Assign
          </button>
        )}

        {/* Student count */}
        <span className="text-sm text-muted-foreground ml-auto">
          {students.length} student{students.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Bulk assign panel */}
      {showBulkPanel && isAdmin && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-foreground font-medium">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {selectedIds.size === students.length ? "Deselect all" : "Select all"}
            </button>
            <select
              value={bulkCoachId}
              onChange={(e) => setBulkCoachId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select coach...</option>
              <option value="unassign">Unassign coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={selectedIds.size === 0 || !bulkCoachId || bulkAssigning}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bulkAssigning && <Loader2 className="size-3.5 animate-spin" />}
              Assign
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="size-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No students found.</p>
        </div>
      ) : groupedByCoach ? (
        /* Admin grouped view */
        <div className="space-y-6">
          {groupedByCoach.map(([key, group]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  {group.coach
                    ? group.coach.name || group.coach.email
                    : "Unassigned"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  ({group.students.length})
                </span>
              </div>
              <StudentTable
                students={group.students}
                showCoach={false}
                showBulk={showBulkPanel}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </div>
          ))}
        </div>
      ) : (
        /* Flat list view */
        <StudentTable
          students={students}
          showCoach={isAdmin}
          showBulk={showBulkPanel && isAdmin}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}
    </div>
  );
}

function StudentTable({
  students,
  showCoach,
  showBulk,
  selectedIds,
  onToggleSelect,
}: {
  students: StudentRow[];
  showCoach: boolean;
  showBulk: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {showBulk && (
                <th className="w-10 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Student
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              {showCoach && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Coach
                </th>
              )}
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                1:1 Rating
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Inner Circle Rating
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Coaching Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-b border-border/60 hover:bg-muted/30 transition-colors"
              >
                {showBulk && (
                  <td className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(student.id)}
                      onChange={() => onToggleSelect(student.id)}
                      className="rounded border-input"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-foreground font-medium">
                  <Link
                    href={`/admin/users/${student.id}`}
                    className="hover:text-primary transition-colors"
                  >
                    {student.name || student.email.split("@")[0]}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {student.email}
                </td>
                {showCoach && (
                  <td className="px-4 py-3 text-sm text-foreground">
                    {student.coachName || student.coachEmail || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-center">
                  <StarRating
                    value={student.avgRating1on1}
                    count={student.ratingCount1on1}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <StarRating
                    value={student.avgRatingInnerCircle}
                    count={student.ratingCountInnerCircle}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/coaching/one-on-one?student=${encodeURIComponent(student.email)}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    1:1 Notes
                    <ExternalLink className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
