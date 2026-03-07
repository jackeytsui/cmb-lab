"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

interface SyncEvent {
  id: string;
  eventType: string;
  direction: "inbound" | "outbound";
  status: "pending" | "processing" | "completed" | "failed";
  entityType: string;
  entityId: string | null;
  ghlContactId: string | null;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  retryCount: number;
  processedAt: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  processing: "bg-blue-500/10 text-blue-400",
  completed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
};

const DIRECTION_STYLES: Record<string, string> = {
  inbound: "bg-blue-500/10 text-blue-400",
  outbound: "bg-purple-500/10 text-purple-400",
};

export function SyncEventLog() {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchEvents = useCallback(
    async (reset = false) => {
      const currentOffset = reset ? 0 : offset;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        if (directionFilter) params.set("direction", directionFilter);
        if (statusFilter) params.set("status", statusFilter);
        params.set("limit", String(limit));
        params.set("offset", String(currentOffset));

        const res = await fetch(
          `/api/admin/ghl/sync-events?${params.toString()}`
        );
        const data = await res.json();

        if (reset) {
          setEvents(data.events || []);
          setOffset(limit);
        } else {
          setEvents((prev) => [...prev, ...(data.events || [])]);
          setOffset(currentOffset + limit);
        }
        setTotal(data.total || 0);
      } catch {
        // silently fail on refresh
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [directionFilter, statusFilter, offset]
  );

  // Initial load and filter changes
  useEffect(() => {
    setOffset(0);
    fetchEvents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionFilter, statusFilter]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionFilter, statusFilter]);

  const hasMore = events.length < total;

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded bg-zinc-700" />
          <div className="h-4 w-56 rounded bg-zinc-700" />
          <div className="h-48 rounded bg-zinc-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Sync Event Log</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Recent sync events between LMS and GoHighLevel.{" "}
            <span className="text-zinc-500">Auto-refreshes every 30s.</span>
          </p>
        </div>
        <span className="text-xs text-zinc-500">{total} total events</span>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-3">
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="rounded border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400">
              <th className="pb-3 pr-4 font-medium">Time</th>
              <th className="pb-3 pr-4 font-medium">Direction</th>
              <th className="pb-3 pr-4 font-medium">Event Type</th>
              <th className="pb-3 pr-4 font-medium">Entity</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <Fragment key={event.id}>
                <tr
                  onClick={() =>
                    setExpandedId(
                      expandedId === event.id ? null : event.id
                    )
                  }
                  className="cursor-pointer border-b border-zinc-700/50 transition-colors hover:bg-zinc-700/30"
                >
                  <td className="py-2.5 pr-4 text-zinc-400">
                    {timeAgo(event.createdAt)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        DIRECTION_STYLES[event.direction] || ""
                      }`}
                    >
                      {event.direction}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-zinc-300">
                    {event.eventType}
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-300">
                    {event.entityType}
                    {event.entityId && (
                      <span className="ml-1 text-zinc-500">
                        ({event.entityId.slice(0, 8)}...)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[event.status] || ""
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate py-2.5 text-xs text-red-400">
                    {event.errorMessage || ""}
                  </td>
                </tr>
                {expandedId === event.id && (
                  <tr className="border-b border-zinc-700/50">
                    <td colSpan={6} className="px-4 py-3">
                      <pre className="max-h-48 overflow-auto rounded bg-zinc-900 p-3 text-xs text-zinc-300">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {events.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">
            No sync events yet. Events will appear here as the GHL integration
            processes data.
          </p>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchEvents(false)}
            disabled={loadingMore}
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : `Load More (${events.length}/${total})`}
          </button>
        </div>
      )}
    </div>
  );
}
