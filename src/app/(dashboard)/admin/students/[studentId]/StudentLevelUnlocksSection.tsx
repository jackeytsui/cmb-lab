"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Unlock } from "lucide-react";

interface LevelUnlock {
  id: string;
  level: "intermediate" | "advanced";
  source: "team" | "assistant";
  note: string | null;
  createdAt: string;
}

const LEVELS: { key: "intermediate" | "advanced"; label: string }[] = [
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
];

const SOURCE_LABEL: Record<LevelUnlock["source"], string> = {
  team: "Unlocked by team",
  assistant: "Unlocked via Lab Assistant (one-time)",
};

/**
 * Admin control for a student's gated course levels. Levels normally unlock
 * by finishing the previous level; a grant here opens one early. Grants are
 * mirrored to GHL as "CMB Level Unlocked: …" contact tags so the team sees
 * the same state in GoHighLevel.
 */
export function StudentLevelUnlocksSection({ studentId }: { studentId: string }) {
  const [unlocks, setUnlocks] = useState<LevelUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyLevel, setBusyLevel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUnlocks = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/students/${studentId}/level-unlocks`);
      if (res.ok) {
        const data = await res.json();
        setUnlocks(data.unlocks || []);
      }
    } catch (err) {
      console.error("Failed to fetch level unlocks:", err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchUnlocks();
  }, [fetchUnlocks]);

  const mutate = async (
    level: "intermediate" | "advanced",
    method: "POST" | "DELETE",
  ) => {
    setBusyLevel(level);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/students/${studentId}/level-unlocks`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Request failed");
      } else {
        const data = await res.json();
        setUnlocks(data.unlocks || []);
      }
    } catch {
      setError("Request failed");
    } finally {
      setBusyLevel(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading level unlocks...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Levels unlock automatically when the previous level is 100% complete.
        Granting an early unlock here bypasses that requirement and tags the
        student&apos;s GHL contact so the team can see it in GoHighLevel.
      </p>
      {LEVELS.map(({ key, label }) => {
        const grant = unlocks.find((unlock) => unlock.level === key);
        const busy = busyLevel === key;
        return (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {grant ? (
                <Unlock className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 shrink-0 text-zinc-500" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">{label}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {grant
                    ? `${SOURCE_LABEL[grant.source]} · ${new Date(grant.createdAt).toLocaleDateString()}`
                    : "No early unlock — opens when the previous level is finished"}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => mutate(key, grant ? "DELETE" : "POST")}
              className={
                grant
                  ? "shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  : "shrink-0 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
              }
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : grant ? (
                "Revoke unlock"
              ) : (
                "Unlock early"
              )}
            </button>
          </div>
        );
      })}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
