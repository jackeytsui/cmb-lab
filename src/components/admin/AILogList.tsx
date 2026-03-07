"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Mic,
  Video,
  ChevronLeft,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface AILog {
  id: string;
  type: "text" | "audio" | "video";
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  interactionPrompt: string;
  studentResponse: string;
  transcription: string | null;
  score: number;
  aiFeedback: string;
  passed: boolean;
  createdAt: string;
  source: "attempt" | "submission";
}

interface Filters {
  studentId?: string;
  type?: "text" | "audio" | "video" | "all";
  startDate?: string;
  endDate?: string;
}

interface AILogListProps {
  initialLogs: AILog[];
  initialTotal: number;
}

/**
 * AILogList - displays AI feedback logs with filters and expandable rows.
 */
export function AILogList({ initialLogs, initialTotal }: AILogListProps) {
  const [logs, setLogs] = useState<AILog[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Filter state
  const [filters, setFilters] = useState<Filters>({
    type: "all",
  });
  const [studentSearch, setStudentSearch] = useState("");

  // Fetch logs when filters or offset change
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (filters.studentId) params.set("studentId", filters.studentId);
      if (filters.type && filters.type !== "all")
        params.set("type", filters.type);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);

      const res = await fetch(`/api/admin/ai-logs?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch AI logs");
      }
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error("Error fetching AI logs:", err);
      setError("Failed to load AI logs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  // Re-fetch when filters change
  useEffect(() => {
    // Skip initial load if we have initialLogs and no filters applied
    const hasFilters =
      filters.studentId ||
      filters.type !== "all" ||
      filters.startDate ||
      filters.endDate ||
      offset !== 0;
    if (hasFilters) {
      fetchLogs();
    }
  }, [filters, offset, fetchLogs]);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setOffset(0); // Reset pagination
  };

  const toggleExpand = (logId: string) => {
    setExpandedLogId((prev) => (prev === logId ? null : logId));
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return "bg-green-500/10 border-green-500/30";
    if (score >= 70) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
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
      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        {/* Student filter - simplified text input */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-zinc-500 mb-1">
            Filter by Student ID
          </label>
          <input
            type="text"
            placeholder="Enter student ID..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            onBlur={() => {
              if (studentSearch !== filters.studentId) {
                handleFilterChange({ studentId: studentSearch || undefined });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleFilterChange({ studentId: studentSearch || undefined });
              }
            }}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        {/* Type filter */}
        <div className="w-36">
          <label className="block text-xs text-zinc-500 mb-1">Type</label>
          <select
            value={filters.type || "all"}
            onChange={(e) =>
              handleFilterChange({
                type: e.target.value as "text" | "audio" | "all",
              })
            }
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="text">Text</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </div>

        {/* Date range */}
        <div className="w-40">
          <label className="block text-xs text-zinc-500 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ""}
            onChange={(e) =>
              handleFilterChange({ startDate: e.target.value || undefined })
            }
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        <div className="w-40">
          <label className="block text-xs text-zinc-500 mb-1">End Date</label>
          <input
            type="date"
            value={filters.endDate || ""}
            onChange={(e) =>
              handleFilterChange({ endDate: e.target.value || undefined })
            }
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        {/* Clear filters */}
        {(filters.studentId ||
          filters.type !== "all" ||
          filters.startDate ||
          filters.endDate) && (
          <button
            onClick={() => {
              setFilters({ type: "all" });
              setStudentSearch("");
            }}
            className="self-end px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <ErrorAlert message={error} onRetry={fetchLogs} />
      )}

      {/* Loading skeleton */}
      {loading && <AILogListSkeleton />}

      {/* Log list */}
      {!loading && !error && (
        <>
          {logs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const displayName =
                  log.studentName || log.studentEmail.split("@")[0];

                return (
                  <div
                    key={log.id}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden"
                  >
                    {/* Log row header */}
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Type icon */}
                        {log.type === "video" ? (
                          <Video className="w-5 h-5 text-rose-400 shrink-0" />
                        ) : log.type === "audio" ? (
                          <Mic className="w-5 h-5 text-purple-400 shrink-0" />
                        ) : (
                          <MessageSquare className="w-5 h-5 text-blue-400 shrink-0" />
                        )}

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white truncate">
                              {displayName}
                            </span>
                            <span className="text-zinc-500 text-sm hidden md:inline">
                              {log.studentEmail}
                            </span>
                          </div>
                          <div className="text-sm text-zinc-400 truncate">
                            {log.lessonTitle}
                          </div>
                        </div>

                        {/* Response preview */}
                        <div className="hidden lg:block flex-1 min-w-0 max-w-xs">
                          <div className="text-sm text-zinc-500 truncate">
                            {log.type === "audio" && log.transcription
                              ? log.transcription
                              : log.studentResponse}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {/* Score badge */}
                        <div
                          className={`px-2 py-1 rounded-md border text-sm font-medium ${getScoreBgColor(
                            log.score
                          )} ${getScoreColor(log.score)}`}
                        >
                          {log.score}
                        </div>

                        {/* Pass/fail indicator */}
                        {log.passed ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}

                        {/* Date */}
                        <span className="text-xs text-zinc-500 w-20 text-right hidden sm:block">
                          {formatDistanceToNow(new Date(log.createdAt), {
                            addSuffix: true,
                          })}
                        </span>

                        {/* Expand icon */}
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-zinc-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 pb-4 border-t border-zinc-800">
                            <div className="pt-4 space-y-4">
                              {/* Prompt */}
                              <div>
                                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                                  Prompt
                                </h4>
                                <p className="text-zinc-300 text-sm">
                                  {log.interactionPrompt}
                                </p>
                              </div>

                              {/* Student response */}
                              <div>
                                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                                  Student Response
                                </h4>
                                <p className="text-zinc-300 text-sm">
                                  {log.studentResponse}
                                </p>
                              </div>

                              {/* Transcription (audio only) */}
                              {log.type === "audio" && log.transcription && (
                                <div>
                                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                                    Transcription
                                  </h4>
                                  <p className="text-zinc-300 text-sm italic">
                                    &ldquo;{log.transcription}&rdquo;
                                  </p>
                                </div>
                              )}

                              {/* AI Feedback */}
                              <div>
                                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                                  AI Feedback
                                </h4>
                                <p className="text-zinc-300 text-sm bg-zinc-800/50 p-3 rounded-lg">
                                  {log.aiFeedback}
                                </p>
                              </div>

                              {/* Meta info */}
                              <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
                                <span>
                                  Date:{" "}
                                  {format(
                                    new Date(log.createdAt),
                                    "MMM d, yyyy h:mm a"
                                  )}
                                </span>
                                <span>Source: {log.source}</span>
                                <span>Type: {log.type}</span>
                                <span
                                  className={
                                    log.passed
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }
                                >
                                  {log.passed ? "Passed" : "Failed"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <span className="text-sm text-zinc-400">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of{" "}
                {total} logs
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

function AILogListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="w-5 h-5 rounded bg-zinc-700" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-7 w-12 bg-zinc-700 rounded" />
            <Skeleton className="h-5 w-5 bg-zinc-700 rounded-full" />
            <Skeleton className="h-4 w-20 bg-zinc-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <MessageSquare className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">No AI logs found</h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        AI feedback logs will appear here once students submit responses.
      </p>
    </div>
  );
}
