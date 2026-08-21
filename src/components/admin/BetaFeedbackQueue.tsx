"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bug, Lightbulb, Loader2, MessageSquare, RefreshCw } from "lucide-react";

type Status = "new" | "reviewing" | "planned" | "resolved" | "closed";
type Item = {
  id: string; category: "bug" | "feature_request" | "general"; message: string;
  pagePath: string | null; source: string; status: Status; adminNote: string | null;
  createdAt: string; userName: string | null; userEmail: string;
};
const STATUSES: Status[] = ["new", "reviewing", "planned", "resolved", "closed"];
const LABELS: Record<Status, string> = { new: "New", reviewing: "Reviewing", planned: "Planned", resolved: "Resolved", closed: "Closed" };

export function BetaFeedbackQueue() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Array<{ status: Status; count: number }>>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/admin/beta-feedback${filter === "all" ? "" : `?status=${filter}`}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to load feedback");
      setItems(data.items || []); setCounts(data.counts || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Failed to load feedback"); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);
  const countMap = useMemo(() => new Map(counts.map((row) => [row.status, row.count])), [counts]);

  async function update(id: string, values: { status?: Status; adminNote?: string | null }) {
    setSaving(id); setError(null);
    try {
      const response = await fetch("/api/admin/beta-feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...values }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Update failed");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Update failed"); }
    finally { setSaving(null); }
  }

  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-foreground">Beta feedback queue</h3><p className="mt-0.5 text-xs text-muted-foreground">Bugs, ideas, and product feedback submitted through the Lab Assistant.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("all")} className={`rounded-full border px-2.5 py-1 text-xs ${filter === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>All</button>
        {STATUSES.map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-full border px-2.5 py-1 text-xs ${filter === status ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{LABELS[status]} {countMap.get(status) ?? 0}</button>)}
      </div>
      {error && <p className="mt-3 rounded-md bg-red-500/10 p-2 text-xs text-red-500">{error}</p>}
      {loading && items.length === 0 ? <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading feedback…</div> : items.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No feedback in this view.</p> : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">{items.map((item) => {
          const Icon = item.category === "bug" ? Bug : item.category === "feature_request" ? Lightbulb : MessageSquare;
          return <article key={item.id} className="rounded-lg border border-border bg-background/50 p-3">
            <div className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold capitalize">{item.category.replace("_", " ")}</span><span className="text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></div><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.message}</p><p className="mt-2 truncate text-xs text-muted-foreground">{item.userName || "Student"} · {item.userEmail}{item.pagePath ? ` · ${item.pagePath}` : ""}</p></div></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto]"><select value={item.status} disabled={saving === item.id} onChange={(e) => void update(item.id, { status: e.target.value as Status })} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">{STATUSES.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}</select><input defaultValue={item.adminNote || ""} placeholder="Internal note…" className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" id={`note-${item.id}`} /><button disabled={saving === item.id} onClick={() => void update(item.id, { adminNote: (document.getElementById(`note-${item.id}`) as HTMLInputElement)?.value || null })} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Save note</button></div>
          </article>;
        })}</div>
      )}
    </section>
  );
}
