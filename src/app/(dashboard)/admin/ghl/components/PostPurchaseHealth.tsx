"use client";

import { useCallback, useEffect, useState } from "react";

type HealthStats = {
  webhooksLast30d: number;
  lastWebhookAt: string | null;
  sourceRows: number;
  duplicateSourceRows: number;
  checked: number;
  alreadyCorrect: number;
  wouldProvision: number;
  provisioned: number;
  usersCreated: number;
  invitationsSent: number;
  tagsAdded: number;
  tagsRemoved: number;
  skippedInvalid: number;
  failed: number;
};

export function PostPurchaseHealth() {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/ghl/post-purchase-health", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Health check failed");
      setStats(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function repair() {
    if (!stats?.wouldProvision) return;
    if (
      !window.confirm(
        `Repair access for ${stats.wouldProvision} account${stats.wouldProvision === 1 ? "" : "s"}? This may create missing accounts, send first-time invitations, update access tags, and copy contacts to the Course sub-account.`,
      )
    ) {
      return;
    }

    setRepairing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ghl/post-purchase-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resyncGhl: false }),
      });
      const body = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(body.error || "Repair failed");
      }
      setMessage(
        body.failed > 0
          ? `Repaired ${body.provisioned}; ${body.failed} still need attention.`
          : `Repaired ${body.provisioned} account${body.provisioned === 1 ? "" : "s"}.`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  const healthy = Boolean(
    stats &&
      stats.wouldProvision === 0 &&
      stats.failed === 0 &&
      stats.webhooksLast30d > 0,
  );

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Post-purchase access
            </h2>
            {!loading && stats && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  healthy
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {healthy ? "Healthy" : "Needs attention"}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Audits eligible GHL purchases against CMB Lab accounts, controlled
            access tags, and Course sub-account contact links. The scheduled
            repair runs every 15 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || repairing}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check now"}
        </button>
      </div>

      {stats && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Eligible accounts" value={stats.checked} />
          <Metric label="Already correct" value={stats.alreadyCorrect} />
          <Metric label="Need repair" value={stats.wouldProvision} />
          <Metric label="Webhook deliveries (30d)" value={stats.webhooksLast30d} />
        </div>
      )}

      {stats && (
        <p className="mt-3 text-xs text-zinc-400">
          Last direct post-purchase webhook: {formatTimestamp(stats.lastWebhookAt)}.
          {stats.skippedInvalid > 0
            ? ` ${stats.skippedInvalid} invalid source row${stats.skippedInvalid === 1 ? "" : "s"} skipped.`
            : ""}
        </p>
      )}

      {stats && stats.duplicateSourceRows > 0 && (
        <p className="mt-3 text-xs text-zinc-400">
          Combined {stats.duplicateSourceRows} duplicate purchase row
          {stats.duplicateSourceRows === 1 ? "" : "s"} by email before
          calculating access.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {stats && stats.wouldProvision > 0 && (
          <button
            type="button"
            onClick={() => void repair()}
            disabled={repairing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {repairing
              ? "Repairing…"
              : `Repair ${stats.wouldProvision} account${stats.wouldProvision === 1 ? "" : "s"}`}
          </button>
        )}
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "none recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}
