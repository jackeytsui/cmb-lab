"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FormSummary = {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
  shareUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ImportRow = {
  id: string;
  sourceFormId: string;
  sourceFormTitle: string;
  status: string;
  threadId: string | null;
  lessonId: string | null;
  stats: Record<string, unknown>;
  lastError: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type ImportStatus = {
  project: { id: string; courseId: string; courseUrl: string } | null;
  inventory: {
    scanId: string;
    formCount: number;
    completedAt: string | null;
    forms: FormSummary[];
  } | null;
  imports: ImportRow[];
  media: Record<string, number>;
};

type Preview = {
  id: string;
  title: string;
  description: string | null;
  warnings: string[];
  stats: {
    questions: number;
    promptTexts: number;
    transcriptions: number;
    sourceMedia: number;
    logicActions: number;
  };
  questions: Array<{
    id: string;
    label: string;
    promptText: string;
    responseType: string;
    allowedResponseTypes: string[];
    hasMedia: boolean;
    logicActions: number;
    warnings: string[];
  }>;
};

type ImportProgress = {
  running: boolean;
  current: string | null;
  completed: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  mediaStarted: number;
};

type Props = {
  configured: boolean;
  connected: boolean;
  organizationName: string | null;
  organizationId: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
};

const EMPTY_PROGRESS: ImportProgress = {
  running: false,
  current: null,
  completed: 0,
  total: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  mediaStarted: 0,
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function statusLabel(status: string | undefined) {
  if (!status) return "Not imported";
  return status.replaceAll("_", " ");
}

function isComplete(status: string) {
  return status === "completed" || status === "completed_with_warnings";
}

export function VideoAskIntegrationClient(props: Props) {
  const [scanning, setScanning] = useState(false);
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus>({
    project: null,
    inventory: null,
    imports: [],
    media: {},
  });
  const [statusLoading, setStatusLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(EMPTY_PROGRESS);
  const [importError, setImportError] = useState<string | null>(null);
  const stopRequested = useRef(false);

  const importsByFormId = useMemo(
    () => new Map(status.imports.map((item) => [item.sourceFormId, item])),
    [status.imports],
  );
  const importSummary = useMemo(() => {
    const completed = status.imports.filter((item) => isComplete(item.status)).length;
    const warnings = status.imports.filter(
      (item) => item.status === "completed_with_warnings",
    ).length;
    const failed = status.imports.filter((item) => item.status === "failed").length;
    return { completed, warnings, failed };
  }, [status.imports]);

  async function loadImportStatus(silent = false) {
    if (!props.connected) return;
    if (!silent) setStatusLoading(true);
    try {
      const response = await fetch("/api/admin/integrations/videoask/imports", {
        cache: "no-store",
      });
      const nextStatus = await jsonResponse<ImportStatus>(response);
      setStatus(nextStatus);
      if (forms === null && nextStatus.inventory) {
        setForms(nextStatus.inventory.forms);
        setSelected(new Set(nextStatus.inventory.forms.map((form) => form.id)));
      }
    } catch (error) {
      if (!silent) {
        setImportError(
          error instanceof Error ? error.message : "Could not load import status",
        );
      }
    } finally {
      if (!silent) setStatusLoading(false);
    }
  }

  useEffect(() => {
    void loadImportStatus(true);
    // The connection state is the only server prop that should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.connected]);

  async function scanInventory() {
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/admin/integrations/videoask/forms", {
        cache: "no-store",
      });
      const payload = await jsonResponse<{ forms: FormSummary[] }>(response);
      setForms(payload.forms);
      setSelected(new Set(payload.forms.map((form) => form.id)));
      await loadImportStatus(true);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Inventory scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function inspectForm(formId: string) {
    setPreviewingId(formId);
    setImportError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/videoask/forms/${encodeURIComponent(formId)}`,
        { cache: "no-store" },
      );
      const payload = await jsonResponse<{ form: Preview }>(response);
      setPreview(payload.form);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPreviewingId(null);
    }
  }

  function toggleSelected(formId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      return next;
    });
  }

  async function runImport(targetForms: FormSummary[]) {
    if (targetForms.length === 0 || progress.running) return;
    stopRequested.current = false;
    setImportError(null);
    setProgress({ ...EMPTY_PROGRESS, running: true, total: targetForms.length });

    let completed = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const form of targetForms) {
      if (stopRequested.current) break;
      setProgress((current) => ({ ...current, current: form.title }));
      try {
        const response = await fetch("/api/admin/integrations/videoask/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formId: form.id }),
        });
        const payload = await jsonResponse<{
          result: { status: "imported" | "skipped" };
        }>(response);
        if (payload.result.status === "skipped") skipped += 1;
        else imported += 1;
      } catch {
        failed += 1;
      }
      completed += 1;
      setProgress((current) => ({
        ...current,
        completed,
        imported,
        skipped,
        failed,
      }));
      if (completed % 10 === 0) await loadImportStatus(true);
    }

    let mediaStarted = 0;
    let consecutiveMediaFailures = 0;
    let processingPolls = 0;
    while (!stopRequested.current) {
      setProgress((current) => ({
        ...current,
        current: "Copying source media into CMB Lab…",
      }));
      try {
        const response = await fetch(
          "/api/admin/integrations/videoask/import/media",
          { method: "POST" },
        );
        const payload = await jsonResponse<{
          result: {
            status: "empty" | "ready" | "processing" | "failed";
            action?: "created" | "checked";
            failed?: number;
          };
        }>(response);
        if (payload.result.status === "empty") {
          if ((payload.result.failed ?? 0) > 0) {
            setImportError(
              `${payload.result.failed} media transfer(s) still need attention. Resume the import after reviewing the audit details.`,
            );
          }
          break;
        }
        if (payload.result.action === "created") mediaStarted += 1;
        consecutiveMediaFailures = 0;
        setProgress((current) => ({ ...current, mediaStarted }));
        if (
          payload.result.action === "checked" &&
          payload.result.status === "processing"
        ) {
          processingPolls += 1;
          if (processingPolls >= 300) {
            setImportError(
              "Media is still processing in storage. The import is safe; use Resume/import all later to continue readiness checks.",
            );
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        } else {
          processingPolls = 0;
        }
      } catch {
        consecutiveMediaFailures += 1;
        if (consecutiveMediaFailures >= 3) {
          setImportError(
            "Form import finished, but media transfer paused after repeated errors. Resume import to retry safely.",
          );
          break;
        }
      }
    }

    await loadImportStatus(true);
    setProgress((current) => ({ ...current, running: false, current: null }));
  }

  const selectedForms = forms?.filter((form) => selected.has(form.id)) ?? [];
  const mediaTotal = Object.values(status.media).reduce((sum, count) => sum + count, 0);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {props.connected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : null}
            VideoAsk connection
          </CardTitle>
          <CardDescription>
            OAuth access is refreshed automatically and its credentials are
            encrypted before being stored in Neon.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                {props.connected ? "Connected" : "Not connected"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="font-medium">{props.organizationName || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization ID</dt>
              <dd className="break-all font-mono text-xs">
                {props.organizationId || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last API check</dt>
              <dd className="font-medium">
                {props.lastValidatedAt
                  ? new Date(props.lastValidatedAt).toLocaleString()
                  : "Not checked yet"}
              </dd>
            </div>
          </dl>

          {props.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              The current access token expires {new Date(props.expiresAt).toLocaleString()}.
              CMB Lab will refresh it automatically.
            </p>
          ) : null}
          {props.lastError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Last connection error: {props.lastError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {props.configured ? (
              <Button asChild>
                <a href="/api/admin/integrations/videoask/connect">
                  <RefreshCw />
                  {props.connected ? "Reconnect VideoAsk" : "Connect VideoAsk"}
                </a>
              </Button>
            ) : (
              <Button disabled>
                <RefreshCw />
                Connect VideoAsk
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={scanInventory}
              disabled={!props.connected || scanning || progress.running}
            >
              {scanning ? <Loader2 className="animate-spin" /> : <ScanSearch />}
              {scanning ? "Scanning…" : "Scan inventory"}
            </Button>
          </div>
          {!props.configured ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Add the three VideoAsk environment variables in Vercel, then redeploy.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {status.inventory || status.project || status.imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>Migration audit</span>
              {status.project ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={status.project.courseUrl}>
                    Open draft course <ExternalLink />
                  </Link>
                </Button>
              ) : null}
            </CardTitle>
            <CardDescription>
              Durable Neon records make every form and media transfer safe to resume.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
              <div><dt className="text-muted-foreground">Source forms</dt><dd className="text-lg font-semibold">{status.inventory?.formCount ?? 0}</dd></div>
              <div><dt className="text-muted-foreground">Forms complete</dt><dd className="text-lg font-semibold">{importSummary.completed}</dd></div>
              <div><dt className="text-muted-foreground">With warnings</dt><dd className="text-lg font-semibold">{importSummary.warnings}</dd></div>
              <div><dt className="text-muted-foreground">Failed</dt><dd className="text-lg font-semibold">{importSummary.failed}</dd></div>
              <div><dt className="text-muted-foreground">Media ready</dt><dd className="text-lg font-semibold">{status.media.ready ?? 0}</dd></div>
              <div><dt className="text-muted-foreground">Media tracked</dt><dd className="text-lg font-semibold">{mediaTotal}</dd></div>
            </dl>
            {status.inventory?.completedAt ? (
              <p className="text-xs text-muted-foreground">
                Last complete source scan: {new Date(status.inventory.completedAt).toLocaleString()}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-fit"
              onClick={() => loadImportStatus()}
              disabled={statusLoading}
            >
              {statusLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh audit
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {scanError || importError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {scanError || importError}
        </p>
      ) : null}

      {progress.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {progress.running ? "Migration in progress" : "Migration run finished"}
            </CardTitle>
            <CardDescription>
              {progress.current ||
                `${progress.completed} of ${progress.total} selected forms processed.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.completed}/{progress.total} forms · {progress.imported} imported · {progress.skipped} unchanged · {progress.failed} failed · {progress.mediaStarted} media transfers started
            </p>
            {progress.running ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  stopRequested.current = true;
                }}
              >
                <Pause /> Pause safely
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>Import preview: {preview.title}</span>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </CardTitle>
            <CardDescription>
              Read-only mapping preview. Nothing is changed by inspecting a form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <div><span className="text-muted-foreground">Questions</span><p className="font-semibold">{preview.stats.questions}</p></div>
              <div><span className="text-muted-foreground">Prompt text</span><p className="font-semibold">{preview.stats.promptTexts}</p></div>
              <div><span className="text-muted-foreground">Transcripts</span><p className="font-semibold">{preview.stats.transcriptions}</p></div>
              <div><span className="text-muted-foreground">Media</span><p className="font-semibold">{preview.stats.sourceMedia}</p></div>
              <div><span className="text-muted-foreground">Logic actions</span><p className="font-semibold">{preview.stats.logicActions}</p></div>
            </div>
            {preview.warnings.length > 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="mb-1 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" /> Mapping warnings
                </div>
                {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}
            <div className="max-h-64 overflow-auto rounded-md border">
              {preview.questions.map((question) => (
                <div key={question.id} className="border-b p-3 last:border-b-0">
                  <p className="text-sm font-medium">{question.label}. {question.promptText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {question.hasMedia ? "Media · " : ""}{question.allowedResponseTypes.join(", ")} · {question.logicActions} logic actions
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {forms ? (
        <Card>
          <CardHeader>
            <CardTitle>{forms.length} VideoAsk forms found</CardTitle>
            <CardDescription>
              All forms are selected by default. Imports create or update one native
              Interactive Video lesson per form in a draft CMB Lab course.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set(forms.map((form) => form.id)))}
                disabled={progress.running}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set())}
                disabled={progress.running}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => runImport(selectedForms)}
                disabled={progress.running || selectedForms.length === 0}
              >
                {progress.running ? <Loader2 className="animate-spin" /> : <Play />}
                Import selected ({selectedForms.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => runImport(forms)}
                disabled={progress.running || forms.length === 0}
              >
                <RefreshCw /> Resume/import all ({forms.length})
              </Button>
              <span className="text-xs text-muted-foreground">
                Destination remains draft until you publish it.
              </span>
            </div>

            <div className="max-h-[34rem] overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <span className="sr-only">Selected</span>
                    </th>
                    <th className="px-3 py-2 font-medium">Form</th>
                    <th className="px-3 py-2 font-medium">Folder</th>
                    <th className="px-3 py-2 font-medium">Import status</th>
                    <th className="px-3 py-2 font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((form) => {
                    const imported = importsByFormId.get(form.id);
                    return (
                      <tr key={form.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(form.id)}
                            onChange={() => toggleSelected(form.id)}
                            disabled={progress.running}
                            aria-label={`Select ${form.title}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{form.title}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {form.id}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {form.folderName || form.folderId || "Root"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={isComplete(imported?.status ?? "") ? "text-emerald-600 dark:text-emerald-400" : imported?.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                            {statusLabel(imported?.status)}
                          </span>
                          {imported?.lastError ? (
                            <p className="mt-1 max-w-xs text-xs text-destructive">
                              {imported.lastError}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => inspectForm(form.id)}
                            disabled={previewingId === form.id || progress.running}
                          >
                            {previewingId === form.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Eye />
                            )}
                            Preview
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
