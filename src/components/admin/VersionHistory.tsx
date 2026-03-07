"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, RotateCcw, Clock, User } from "lucide-react";

interface Version {
  id: string;
  version: number;
  content: string;
  fullContent: string;
  changeNote: string | null;
  createdAt: string;
  createdBy: string;
}

interface VersionHistoryProps {
  promptId: string;
  currentVersion: number;
  onVersionRestored?: (newVersion: number) => void;
}

/**
 * VersionHistory component - displays version history with restore capability.
 *
 * Features:
 * - Lists all versions in descending order
 * - Expand/collapse to view full content
 * - Restore any previous version (creates new version)
 * - Shows version number, date, editor, and change note
 */
export function VersionHistory({
  promptId,
  currentVersion,
  onVersionRestored,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(
    null
  );
  const [latestVersion, setLatestVersion] = useState(currentVersion);

  const loadVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/prompts/${promptId}/versions`);
      if (!response.ok) {
        throw new Error("Failed to load versions");
      }
      const data = await response.json();
      setVersions(data.versions);
      if (data.versions.length > 0) {
        setLatestVersion(data.versions[0].version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleRestore = async (versionId: string, versionNumber: number) => {
    const confirmed = window.confirm(
      `Restore version ${versionNumber}? This will create a new version with the old content.`
    );

    if (!confirmed) return;

    setRestoring(versionId);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/prompts/${promptId}/versions/${versionId}/restore`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to restore version");
      }

      const data = await response.json();

      // Refresh version list
      await loadVersions();

      // Call callback if provided
      if (onVersionRestored) {
        onVersionRestored(data.version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setRestoring(null);
    }
  };

  const toggleExpand = (versionId: string) => {
    setExpandedVersionId(expandedVersionId === versionId ? null : versionId);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold mb-4">Version History</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-lg font-semibold mb-4">Version History</h2>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {versions.length === 0 ? (
        <p className="text-zinc-500 text-sm">No version history available.</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {versions.map((version) => {
            const isExpanded = expandedVersionId === version.id;
            const isCurrent = version.version === latestVersion;
            const isRestoring = restoring === version.id;
            const createdAgo = formatDistanceToNow(
              new Date(version.createdAt),
              { addSuffix: true }
            );

            return (
              <div
                key={version.id}
                className={`rounded-lg border ${
                  isCurrent
                    ? "border-purple-500/50 bg-purple-500/5"
                    : "border-zinc-700 bg-zinc-800/50"
                } p-3`}
              >
                {/* Version header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isCurrent
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      v{version.version}
                    </span>
                    {isCurrent && (
                      <span className="text-xs text-purple-400">Current</span>
                    )}
                  </div>
                </div>

                {/* Change note */}
                {version.changeNote && (
                  <p className="text-sm text-zinc-300 mb-2">
                    {version.changeNote}
                  </p>
                )}

                {/* Metadata */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mb-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {createdAgo}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {version.createdBy}
                  </span>
                </div>

                {/* Content preview / expanded */}
                <div className="mb-2">
                  {isExpanded ? (
                    <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {version.fullContent}
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-500 truncate">
                      {version.content}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(version.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        View
                      </>
                    )}
                  </button>
                  {!isCurrent && (
                    <button
                      onClick={() => handleRestore(version.id, version.version)}
                      disabled={isRestoring}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 hover:text-purple-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {isRestoring ? "Restoring..." : "Restore"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
