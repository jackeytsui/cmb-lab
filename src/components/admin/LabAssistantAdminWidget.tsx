"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Overview {
  windowDays: number;
  stats: {
    scans: number;
    resolved: number;
    resolutionRate: number | null;
    urgent: number;
    escalations: { total: number; failed: number };
    testimonials: { total: number; failed: number };
  };
  intentBreakdown: Array<{ intent: string; count: number }>;
  recentHandovers: Array<{
    id: string;
    type: "escalation" | "testimonial";
    status: string;
    title: string;
    error: string | null;
    createdAt: string;
  }>;
  health: {
    openaiConfigured: boolean;
    activeLocations: number;
    promptSeeded: boolean;
    missingMappings: string[];
  };
  errors: string[];
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LabAssistantAdminWidget() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/lab-assistant/overview");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setOverview(await res.json());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          CMB Lab Assistant
        </h2>
        <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">
          Beta
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto mr-6 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Support chatbot health, resolution stats, guidance editing, and a live
        test console. Field mappings live in{" "}
        <Link href="/admin/ghl" className="underline hover:text-foreground">
          GHL Integration
        </Link>
        ; version history in{" "}
        <Link href="/admin/prompts" className="underline hover:text-foreground">
          AI Prompts
        </Link>
        .
      </p>

      {/* Partial-data warnings from the overview endpoint */}
      {overview && overview.errors.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Some sections failed to load:
          {overview.errors.map((e) => (
            <span key={e} className="block truncate">
              • {e}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: stats + health + recent handovers */}
        <div className="space-y-4">
          {loadError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              Couldn&apos;t load overview: {loadError}{" "}
              <button onClick={load} className="underline">
                Retry
              </button>
            </div>
          ) : loading && !overview ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : overview ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  label={`Chats (${overview.windowDays}d)`}
                  value={String(overview.stats.scans)}
                />
                <StatTile
                  label="Resolution"
                  value={
                    overview.stats.resolutionRate !== null
                      ? `${overview.stats.resolutionRate}%`
                      : "—"
                  }
                  warn={
                    overview.stats.resolutionRate !== null &&
                    overview.stats.resolutionRate < 60
                  }
                />
                <StatTile
                  label="Escalations"
                  value={String(overview.stats.escalations.total)}
                  warn={overview.stats.escalations.failed > 0}
                  sub={
                    overview.stats.escalations.failed > 0
                      ? `${overview.stats.escalations.failed} failed`
                      : undefined
                  }
                />
                <StatTile
                  label="Testimonials"
                  value={String(overview.stats.testimonials.total)}
                />
              </div>

              {/* Config health */}
              <div className="rounded-lg border border-border/70 bg-background/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Config health
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-xs">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
                    <span className="text-foreground">
                      Widget access: admins &amp; coaches always; students need
                      the{" "}
                      <span className="font-medium">
                        Lab Assistant (Support Chat)
                      </span>{" "}
                      feature via a tag (Tag Management).
                    </span>
                  </div>
                  <HealthRow
                    ok={overview.health.openaiConfigured}
                    label="OpenAI API key configured"
                    hint="Set OPENAI_API_KEY"
                  />
                  <HealthRow
                    ok={overview.health.activeLocations > 0}
                    label={`Active GHL location (${overview.health.activeLocations})`}
                    hint="Add one under GHL Integration"
                  />
                  <HealthRow
                    ok={overview.health.promptSeeded}
                    label="Guidance prompt saved"
                    hint="Save the guidance below to create it — the built-in default is used meanwhile"
                  />
                  <HealthRow
                    ok={overview.health.missingMappings.length === 0}
                    label={
                      overview.health.missingMappings.length === 0
                        ? "All 5 field mappings configured"
                        : `Missing field mappings: ${overview.health.missingMappings.join(", ")}`
                    }
                    hint="Map them under GHL Integration → Field Mappings"
                  />
                </div>
              </div>

              {/* Intent breakdown */}
              {overview.intentBreakdown.length > 0 && (
                <div className="rounded-lg border border-border/70 bg-background/50 p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Intents ({overview.windowDays}d)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {overview.intentBreakdown.map((row) => (
                      <span
                        key={row.intent}
                        className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                      >
                        {row.intent}{" "}
                        <span className="text-muted-foreground">
                          ×{row.count}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent handovers */}
              <div className="rounded-lg border border-border/70 bg-background/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent handovers
                </h3>
                {overview.recentHandovers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {overview.recentHandovers.map((handover) => (
                      <li
                        key={handover.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        {handover.status === "failed" ? (
                          <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-500" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">
                            {handover.title}
                          </span>
                          {handover.error && (
                            <span className="block truncate text-red-400">
                              {handover.error}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {timeAgo(handover.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/admin/ghl"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Full sync log <ExternalLink className="size-3" />
                </Link>
              </div>
            </>
          ) : null}
        </div>

        {/* Right: test console */}
        <TestConsole />
      </div>

      {/* Guidance editor (full width) */}
      <GuidanceEditor onSaved={load} />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  warn = false,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold",
          warn ? "text-amber-500" : "text-foreground"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-amber-500">{sub}</p>}
    </div>
  );
}

function HealthRow({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-500" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      )}
      <span className={ok ? "text-foreground" : "text-amber-500"}>
        {label}
        {!ok && <span className="block text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

// Track keys mirror TALK_TRACK_INTENTS on the server ("" = overall guidance).
const GUIDANCE_TRACKS: Array<{ key: string; label: string; hint: string }> = [
  {
    key: "",
    label: "Overall guidance",
    hint: "The bot's base instructions: tone, what it may answer, null-state phrasing, escalation and urgent handling. Applies to every message.",
  },
  {
    key: "start_date",
    label: "Start date",
    hint: "Exactly how to answer start-date questions (wording, what to add, when to escalate).",
  },
  {
    key: "end_date",
    label: "End date",
    hint: "Exactly how to answer end-date questions.",
  },
  {
    key: "my_coach",
    label: "My coach",
    hint: "How to talk about coach assignments, including the no-coach-yet case.",
  },
  {
    key: "referral",
    label: "Referrals",
    hint: "Your referral talk track: how the program works, rewards, links to share, what the bot should promise.",
  },
  {
    key: "testimonial_sheldon",
    label: "Testimonial",
    hint: "What to say when booking a testimonial with Sheldon (a GHL task is always created for this intent).",
  },
];

/**
 * Edit the bot's overall guidance and per-intent talk tracks directly from
 * the block. Saves to ai_prompts rows with versioning — changes take effect
 * on the next student message, no deploy needed.
 */
function GuidanceEditor({ onSaved }: { onSaved: () => void }) {
  const [track, setTrack] = useState<string>("");
  const [content, setContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeTrack =
    GUIDANCE_TRACKS.find((t) => t.key === track) ?? GUIDANCE_TRACKS[0];
  const isTalkTrack = track !== "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    const url = track
      ? `/api/admin/lab-assistant/guidance?track=${track}`
      : "/api/admin/lab-assistant/guidance";
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setContent(data.content ?? "");
        setInitialContent(data.content ?? "");
        setVersion(data.version ?? null);
      })
      .catch(() => {
        if (!cancelled) setMessage("Couldn't load this track");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [track]);

  const dirty = content !== initialContent;
  // Talk tracks may be saved empty (clears them); overall guidance may not.
  const canSave = dirty && !saving && (isTalkTrack || !!content.trim());

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const url = track
        ? `/api/admin/lab-assistant/guidance?track=${track}`
        : "/api/admin/lab-assistant/guidance";
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setInitialContent(content);
      setVersion(data.version ?? null);
      setMessage("Saved — live on the next student message");
      setTimeout(() => setMessage(null), 4000);
      onSaved();
    } catch (error) {
      setMessage(
        `Save failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-background/50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Guidance &amp; talk tracks
          {version !== null && (
            <span className="ml-1.5 normal-case font-normal">v{version}</span>
          )}
        </h3>
        {message && (
          <span
            className={cn(
              "text-xs",
              message.startsWith("Save failed") || message.startsWith("Couldn't")
                ? "text-red-500"
                : "text-green-600 dark:text-green-500"
            )}
          >
            {message}
          </span>
        )}
      </div>

      {/* Track selector */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {GUIDANCE_TRACKS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTrack(t.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              track === t.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        {activeTrack.hint}{" "}
        {isTalkTrack
          ? "Leave empty to fall back to the overall guidance. Saves as a new version and applies immediately — test it in the console above."
          : "Paste or edit freely — saves as a new version and applies immediately. Test it in the console above."}
      </p>

      {loading ? (
        <div className="h-32 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={isTalkTrack ? 6 : 10}
            spellCheck={false}
            placeholder={
              isTalkTrack
                ? `e.g. "Always mention the referral reward, share the sign-up link, and offer to pass their question to the team if they want specifics."`
                : undefined
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : isTalkTrack
                  ? `Save "${activeTrack.label}" track`
                  : "Save guidance"}
            </button>
            {dirty && !saving && (
              <button
                type="button"
                onClick={() => setContent(initialContent)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Discard changes
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Live test console: runs the real /api/lab-assistant pipeline (intent scan,
 * gatekept context, guidance) in dry-run mode — no GHL tasks are created and
 * test chats stay out of the resolution metrics. Responses use the signed-in
 * admin's own contact data, exactly as a student would see their own.
 */
function TestConsole() {
  const { messages, sendMessage, status, error, clearError, setMessages } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/lab-assistant",
        body: { dryRun: true },
      }),
    });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend = status === "ready" || status === "error";

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    clearError();
    sendMessage({ text: trimmed });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
    setInput("");
  }

  return (
    <div className="flex min-h-[320px] flex-col rounded-lg border border-border/70 bg-background/50">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Test console
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Dry run: real pipeline, no GHL tasks, excluded from stats. Uses
            your own contact data.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <div className="max-h-[360px] flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask what a student would ask — &quot;When does my program
            start?&quot;, &quot;I want a refund&quot;, &quot;Book a testimonial
            with Sheldon&quot; — and preview the exact reply.
          </p>
        )}
        {messages.map((message) => {
          const text = message.parts
            .filter((part) => part.type === "text")
            .map((part) => ("text" in part ? part.text : ""))
            .join("");
          if (!text) return null;
          return (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-foreground"
                )}
              >
                {text}
              </div>
            </div>
          );
        })}
        {status === "submitted" && (
          <p className="animate-pulse text-xs text-muted-foreground">
            Thinking...
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p className="px-3 pb-1 text-xs text-red-400">
          Request failed — check OPENAI_API_KEY and try again.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-border/70 p-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a test question..."
          className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!canSend || !input.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send test message"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
