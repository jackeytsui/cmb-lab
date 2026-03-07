"use client";

import { useState, useEffect, useCallback } from "react";
import { SubmissionCard } from "./SubmissionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";

// Submission type matching API response
interface SubmissionListItem {
  id: string;
  type: "text" | "audio";
  response: string;
  score: number;
  aiFeedback: string;
  transcription: string | null;
  status: "pending_review" | "reviewed" | "archived";
  createdAt: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  lessonId: string;
  lessonTitle: string;
  interactionId: string;
  interactionPrompt: string;
}

type StatusFilter = "pending_review" | "reviewed" | "all";

/**
 * SubmissionQueue component - displays list of submissions for coach review.
 * Supports filtering by status with tab UI.
 */
export function SubmissionQueue() {
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending_review");

  // Fetch submissions - extracted so it can be called for retry
  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build URL with status filter (API doesn't support "all", so we fetch pending + reviewed)
      const url =
        statusFilter === "all"
          ? "/api/submissions?status=pending_review&limit=100"
          : `/api/submissions?status=${statusFilter}&limit=50`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }

      const data = await response.json();
      let fetchedSubmissions = data.submissions || [];

      // If "all" selected, also fetch reviewed and combine
      if (statusFilter === "all") {
        const reviewedResponse = await fetch(
          "/api/submissions?status=reviewed&limit=100"
        );
        if (reviewedResponse.ok) {
          const reviewedData = await reviewedResponse.json();
          fetchedSubmissions = [
            ...fetchedSubmissions,
            ...(reviewedData.submissions || []),
          ].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
      }

      setSubmissions(fetchedSubmissions);
    } catch (err) {
      console.error("Error fetching submissions:", err);
      setError("Failed to load submissions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Fetch submissions when filter changes
  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Tab button component
  const TabButton = ({
    status,
    label,
  }: {
    status: StatusFilter;
    label: string;
  }) => (
    <button
      onClick={() => setStatusFilter(status)}
      className={`px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
        statusFilter === status
          ? "bg-cyan-600 text-white"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div data-testid="submission-queue" className="space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-2">
        <TabButton status="pending_review" label="Pending" />
        <TabButton status="reviewed" label="Reviewed" />
        <TabButton status="all" label="All" />
      </div>

      {/* Error state */}
      {error && (
        <ErrorAlert message={error} onRetry={fetchSubmissions} />
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SubmissionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && submissions.length === 0 && (
        <div className="text-center py-16">
          <svg
            className="w-16 h-16 text-zinc-600 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <h2 className="text-xl font-semibold text-zinc-300">
            No submissions to review
          </h2>
          <p className="text-zinc-500 mt-2">
            {statusFilter === "pending_review"
              ? "All caught up! No pending submissions at the moment."
              : statusFilter === "reviewed"
              ? "No reviewed submissions yet."
              : "No submissions found."}
          </p>
        </div>
      )}

      {/* Submissions grid */}
      {!loading && !error && submissions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {submissions.map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loader for submission cards
 */
function SubmissionCardSkeleton() {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24 bg-zinc-700" />
        <Skeleton className="h-5 w-12 bg-zinc-700 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4 bg-zinc-700" />
      <Skeleton className="h-4 w-full bg-zinc-700" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-4 w-16 bg-zinc-700" />
        <Skeleton className="h-4 w-20 bg-zinc-700" />
      </div>
    </div>
  );
}
