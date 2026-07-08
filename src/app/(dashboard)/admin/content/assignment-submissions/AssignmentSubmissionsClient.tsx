"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SubmissionRow {
  id: string;
  status: "submitted" | "assigned" | "in_review" | "reviewed";
  assignmentType: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  finalScore: number | null;
  assignedReviewerId: string | null;
  studentName: string | null;
  studentEmail: string;
  assignedReviewerName: string | null;
  assignedReviewerEmail: string | null;
  lessonTitle: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
}

interface Reviewer {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const STATUS_META: Record<
  SubmissionRow["status"],
  { label: string; className: string }
> = {
  submitted: {
    label: "Pending Review",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  assigned: {
    label: "Assigned",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  in_review: {
    label: "In Review",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  reviewed: {
    label: "Reviewed",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

const TYPE_LABELS: Record<string, string> = {
  text_assignment: "Text Assignment",
  vocal_hack: "Vocal Hack",
  diary: "Diary",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function reviewerLabel(name: string | null, email: string | null): string {
  return name || email || "—";
}

export function AssignmentSubmissionsClient({
  currentUserId,
  courses,
}: {
  currentUserId: string;
  courses: Array<{ id: string; title: string }>;
}) {
  const [tab, setTab] = useState<"all" | "assigned">("all");
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewerFilter, setReviewerFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (reviewerFilter) params.set("reviewerId", reviewerFilter);
      if (courseFilter) params.set("courseId", courseFilter);
      const res = await fetch(`/api/admin/assignment-submissions?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.submissions ?? []);
    } catch {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [tab, typeFilter, statusFilter, reviewerFilter, courseFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetch("/api/admin/assignment-submissions/reviewers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReviewers(data?.reviewers ?? []))
      .catch(() => {});
  }, []);

  const handleAssign = async (submissionId: string, reviewerId: string) => {
    setAssigning(submissionId);
    try {
      const res = await fetch(
        `/api/admin/assignment-submissions/${submissionId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewerId: reviewerId || null }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to assign reviewer");
        return;
      }
      toast.success(reviewerId ? "Reviewer assigned" : "Reviewer unassigned");
      await fetchRows();
    } catch {
      toast.error("Failed to assign reviewer");
    } finally {
      setAssigning(null);
    }
  };

  const resetFilters = () => {
    setTypeFilter("");
    setStatusFilter("");
    setReviewerFilter("");
    setCourseFilter("");
  };

  const selectClass =
    "rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground";

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "all" | "assigned")}
      >
        <TabsList>
          <TabsTrigger value="all">All Submissions</TabsTrigger>
          <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Types</option>
          <option value="text_assignment">Text Assignment</option>
          <option value="vocal_hack">Vocal Hack</option>
          <option value="diary">Diary</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Statuses</option>
          <option value="submitted">Pending Review</option>
          <option value="assigned">Assigned</option>
          <option value="in_review">In Review</option>
          <option value="reviewed">Reviewed</option>
        </select>
        <select
          value={reviewerFilter}
          onChange={(e) => setReviewerFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Reviewers</option>
          {reviewers.map((r) => (
            <option key={r.id} value={r.id}>
              {reviewerLabel(r.name, r.email)}
            </option>
          ))}
        </select>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Assignment</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Module</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reviewer</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Reviewed</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {tab === "assigned"
                    ? "No submissions are assigned to you."
                    : "No submissions found."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const statusMeta = STATUS_META[row.status];
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="text-foreground">
                        {row.studentName || row.studentEmail}
                      </div>
                      {row.studentName && (
                        <div className="text-[11px] text-muted-foreground">
                          {row.studentEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {row.lessonTitle}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.courseTitle}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.moduleTitle}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {TYPE_LABELS[row.assignmentType] ?? row.assignmentType}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "reviewed" ? (
                        <span className="text-muted-foreground">
                          {reviewerLabel(
                            row.assignedReviewerName,
                            row.assignedReviewerEmail,
                          )}
                        </span>
                      ) : (
                        <select
                          value={row.assignedReviewerId ?? ""}
                          onChange={(e) =>
                            void handleAssign(row.id, e.target.value)
                          }
                          disabled={assigning === row.id}
                          className={cn(selectClass, "max-w-[160px]")}
                        >
                          <option value="">Unassigned</option>
                          {reviewers.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id === currentUserId
                                ? "Me"
                                : reviewerLabel(r.name, r.email)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {typeof row.finalScore === "number"
                        ? `${row.finalScore}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.reviewedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/content/assignment-submissions/${row.id}`}
                        className={cn(
                          "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold",
                          row.status === "reviewed"
                            ? "border border-border bg-background text-foreground hover:bg-accent"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                      >
                        {row.status === "reviewed" ? "View" : "Review"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
