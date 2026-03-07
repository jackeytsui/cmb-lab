"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  keyPrefixMasked: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const DEFAULT_SCOPES = [
  "read:analytics",
  "read:students",
  "write:students",
  "write:content",
];

const cardClass = "rounded-xl border border-border bg-card p-5";
const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";
const primaryButtonClass =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function AdminApiKeysClient() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopeInput, setScopeInput] = useState(DEFAULT_SCOPES.join(", "));
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load keys");
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const activeCount = useMemo(
    () => keys.filter((key) => !key.revokedAt).length,
    [keys]
  );

  const revokedCount = keys.length - activeCount;

  async function handleCreateKey() {
    const normalized = name.trim();
    if (normalized.length < 2) {
      setError("Key name must be at least 2 characters.");
      return;
    }

    const scopes = scopeInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    setCreating(true);
    setError(null);
    setCreatedRawKey(null);

    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized, scopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create key");
      setCreatedRawKey(data.rawKey || null);
      setName("");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevokeKey(id: string) {
    const confirmed = window.confirm("Revoke this key? This cannot be undone.");
    if (!confirmed) return;

    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to revoke key");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create and revoke admin keys for integrations and internal tooling.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs text-muted-foreground">Total Keys</p>
          <p className="text-2xl font-semibold text-foreground">{keys.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 dark:border-emerald-400/40 dark:bg-emerald-500/10">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 dark:border-amber-400/40 dark:bg-amber-500/10">
          <p className="text-xs text-muted-foreground">Revoked</p>
          <p className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{revokedCount}</p>
        </div>
      </div>

      <section className={`mb-6 ${cardClass}`}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create New Key
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Zapier automation)"
            className={inputClass}
          />
          <input
            value={scopeInput}
            onChange={(e) => setScopeInput(e.target.value)}
            placeholder="Scopes comma-separated"
            className={inputClass}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCreateKey}
            disabled={creating}
            className={primaryButtonClass}
          >
            {creating ? "Creating..." : "Create Key"}
          </button>
          <button
            type="button"
            onClick={fetchKeys}
            className={secondaryButtonClass}
          >
            Refresh
          </button>
        </div>
        {createdRawKey ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 dark:border-emerald-400/40 dark:bg-emerald-500/10">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Copy this key now (shown once)</p>
            <p className="mt-1 break-all font-mono text-sm text-foreground">{createdRawKey}</p>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Existing Keys
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys created yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{key.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{key.keyPrefixMasked}</p>
                  <p className="text-xs text-muted-foreground">
                    Scopes: {key.scopes.length > 0 ? key.scopes.join(", ") : "none"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      key.revokedAt
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {key.revokedAt ? "revoked" : "active"}
                  </span>
                  {!key.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => handleRevokeKey(key.id)}
                      className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-700 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 dark:text-red-300"
                    >
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
