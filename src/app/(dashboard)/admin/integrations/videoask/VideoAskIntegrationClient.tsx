"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  Eye,
  Loader2,
  MapPinned,
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
import {
  courseLibraryReturnHref,
  matchesVideoAskDestination,
  type VideoAskDestinationFocus,
} from "@/lib/videoask/vocal-hack-routing";

function formatVideoAskDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

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
  project: {
    id: string;
    courseId: string | null;
    courseUrl: string | null;
  } | null;
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

type VocalHackPlacementPreview = {
  summary: {
    importedTotal: number;
    targetTotal: number;
    ignoredTotal: number;
    mapped: number;
    exact: number;
    high: number;
    review: number;
    manual: number;
    mediaReady: number;
    targetSentenceVideos: number;
    aiTranscriptionRequired: number;
  };
  forms: Array<{
    formImportId: string;
    sourceFormId: string;
    sourceTitle: string;
    sourceFolderKey: string;
    sourceGroup: string;
    language: "mandarin" | "cantonese";
    stepCount: number;
    mediaReady: number;
    mediaComplete: boolean;
    targetCourse: { id: string; title: string } | null;
    targetModule: { id: string; title: string } | null;
    targetLesson: {
      id: string;
      title: string;
      lessonType: string;
      sortOrder: number;
    } | null;
    targetLessonTitle: string | null;
    action: "replace_placeholder" | "create_lesson" | "manual";
    confidence: "exact" | "high" | "review" | "manual";
    score: number;
    reason: string;
  }>;
};

type VocalHackWorkflowStatus = {
  placements: Array<{
    id: string;
    sourceTitle: string;
    sourceGroup: string;
    language: string;
    status: string;
    confidence: string;
    action: string;
    targetCourseId: string | null;
    targetCourseTitle: string | null;
    targetModuleId: string | null;
    targetModuleTitle: string | null;
    targetLessonId: string | null;
    targetLessonTitle: string | null;
    publishedLessonId: string | null;
    totalSentences: number;
    readySentences: number;
    lastError: string | null;
    updatedAt: string;
  }>;
  sentences: Record<string, number>;
};

type VocalHackTranscriptionProgress = {
  running: boolean;
  processed: number;
  failed: number;
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
  destinationFocus: VideoAskDestinationFocus | null;
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

function confidenceLabel(confidence: string) {
  if (confidence === "exact") return "Exact";
  if (confidence === "high") return "High confidence";
  if (confidence === "review") return "Review";
  return "Choose destination";
}

export function VideoAskIntegrationClient(props: Props) {
  const hasDestinationFocus = props.destinationFocus !== null;
  const destinationFocusKey = [
    props.destinationFocus?.courseId,
    props.destinationFocus?.moduleId,
    props.destinationFocus?.lessonId,
  ].join(":");
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
  const [placementPreview, setPlacementPreview] =
    useState<VocalHackPlacementPreview | null>(null);
  const [showAllPlacements, setShowAllPlacements] = useState(
    !hasDestinationFocus,
  );
  const [placementLoading, setPlacementLoading] = useState(false);
  const [workflow, setWorkflow] = useState<VocalHackWorkflowStatus | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [preparingWorkflow, setPreparingWorkflow] = useState(false);
  const [transcription, setTranscription] =
    useState<VocalHackTranscriptionProgress>({
      running: false,
      processed: 0,
      failed: 0,
    });
  const [progress, setProgress] = useState<ImportProgress>(EMPTY_PROGRESS);
  const [importError, setImportError] = useState<string | null>(null);
  const stopRequested = useRef(false);
  const transcriptionStopRequested = useRef(false);

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
  const destinationFocused = hasDestinationFocus && !showAllPlacements;
  const displayedPlacementForms = useMemo(() => {
    const allForms = placementPreview?.forms ?? [];
    if (!destinationFocused) return allForms;
    return allForms.filter((form) =>
      matchesVideoAskDestination(
        {
          targetCourseId: form.targetCourse?.id ?? null,
          targetModuleId: form.targetModule?.id ?? null,
          targetLessonId: form.targetLesson?.id ?? null,
        },
        props.destinationFocus,
      ),
    );
  }, [destinationFocused, placementPreview, props.destinationFocus]);
  const displayedWorkflowPlacements = useMemo(() => {
    const allPlacements = workflow?.placements ?? [];
    if (!destinationFocused) return allPlacements;
    return allPlacements.filter((placement) =>
      matchesVideoAskDestination(placement, props.destinationFocus),
    );
  }, [destinationFocused, props.destinationFocus, workflow]);
  const displayedWorkflowSummary = useMemo(
    () => ({
      placements: displayedWorkflowPlacements.length,
      awaiting: destinationFocused
        ? displayedWorkflowPlacements.reduce(
            (total, placement) =>
              total +
              Math.max(placement.totalSentences - placement.readySentences, 0),
            0,
          )
        : (workflow?.sentences.held ?? 0) +
          (workflow?.sentences.pending ?? 0),
      ready: destinationFocused
        ? displayedWorkflowPlacements.reduce(
            (total, placement) => total + placement.readySentences,
            0,
          )
        : (workflow?.sentences.ready ?? 0),
      needsAttention: destinationFocused
        ? displayedWorkflowPlacements.filter((placement) => placement.lastError)
            .length
        : (workflow?.sentences.failed ?? 0),
      published: displayedWorkflowPlacements.filter(
        (placement) => placement.status === "published",
      ).length,
    }),
    [destinationFocused, displayedWorkflowPlacements, workflow],
  );
  const focusedDestination =
    displayedPlacementForms[0]?.targetCourse &&
    displayedPlacementForms[0]?.targetModule
      ? [
          displayedPlacementForms[0].targetCourse.title,
          displayedPlacementForms[0].targetModule.title,
          displayedPlacementForms[0].targetLessonTitle,
        ]
          .filter(Boolean)
          .join(" → ")
      : displayedWorkflowPlacements[0]?.targetCourseTitle &&
          displayedWorkflowPlacements[0]?.targetModuleTitle
        ? [
            displayedWorkflowPlacements[0].targetCourseTitle,
            displayedWorkflowPlacements[0].targetModuleTitle,
            displayedWorkflowPlacements[0].targetLessonTitle,
          ]
            .filter(Boolean)
            .join(" → ")
        : null;

  useEffect(() => {
    setShowAllPlacements(!hasDestinationFocus);
  }, [destinationFocusKey, hasDestinationFocus]);

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
        // Source ingestion is an advanced, potentially large operation. Keep
        // it opt-in so the primary blended-course workflow cannot accidentally
        // stage every unrelated VideoAsk workflow.
        setSelected(new Set());
      }
      if (nextStatus.imports.length > 0 && !placementPreview) {
        void loadPlacementPreview(true);
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
    void loadWorkflowStatus(true);
    // The connection state is the only server prop that should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.connected]);

  async function loadWorkflowStatus(silent = false) {
    if (!props.connected) return;
    if (!silent) setWorkflowLoading(true);
    try {
      const response = await fetch(
        "/api/admin/integrations/videoask/vocal-hack/status",
        { cache: "no-store" },
      );
      setWorkflow(await jsonResponse<VocalHackWorkflowStatus>(response));
    } catch (error) {
      if (!silent) {
        setImportError(
          error instanceof Error
            ? error.message
            : "Could not load the Vocal Hack review workflow",
        );
      }
    } finally {
      if (!silent) setWorkflowLoading(false);
    }
  }

  async function scanInventory() {
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/admin/integrations/videoask/forms", {
        cache: "no-store",
      });
      const payload = await jsonResponse<{ forms: FormSummary[] }>(response);
      setForms(payload.forms);
      setSelected(new Set());
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

  async function loadPlacementPreview(silent = false) {
    if (!silent) {
      setPlacementLoading(true);
      setImportError(null);
    }
    try {
      const response = await fetch(
        "/api/admin/integrations/videoask/vocal-hack/preview",
        { cache: "no-store" },
      );
      setPlacementPreview(
        await jsonResponse<VocalHackPlacementPreview>(response),
      );
    } catch (error) {
      if (!silent) {
        setImportError(
          error instanceof Error
            ? error.message
            : "Could not build the blended-course preview",
        );
      }
    } finally {
      if (!silent) setPlacementLoading(false);
    }
  }

  async function prepareReviewDrafts() {
    setPreparingWorkflow(true);
    setImportError(null);
    try {
      const response = await fetch(
        "/api/admin/integrations/videoask/vocal-hack/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            destinationFocused
              ? {
                  formImportIds: displayedPlacementForms.map(
                    (form) => form.formImportId,
                  ),
                }
              : {},
          ),
        },
      );
      await jsonResponse<{ result: { placements: number; sentences: number } }>(
        response,
      );
      await loadWorkflowStatus(true);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Could not prepare Vocal Hack review drafts",
      );
    } finally {
      setPreparingWorkflow(false);
    }
  }

  async function runSafeTranscription() {
    if (transcription.running) return;
    const approved = window.confirm(
      "Start AI transcription for exact and high-confidence course matches? " +
        "CMB Lab will send each private coach-video clip to OpenAI one at a time. " +
        "No live course lesson will be changed.",
    );
    if (!approved) return;

    transcriptionStopRequested.current = false;
    setImportError(null);
    setTranscription({ running: true, processed: 0, failed: 0 });
    try {
      const queueResponse = await fetch(
        "/api/admin/integrations/videoask/vocal-hack/queue",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "safe" }),
        },
      );
      await jsonResponse<{ result: { placements: number; sentences: number } }>(
        queueResponse,
      );

      let processed = 0;
      let failed = 0;
      while (!transcriptionStopRequested.current) {
        const response = await fetch(
          "/api/admin/integrations/videoask/vocal-hack/process",
          { method: "POST" },
        );
        const payload = await jsonResponse<{
          result: {
            status: "empty" | "ready" | "failed";
            remaining?: number;
          };
        }>(response);
        if (payload.result.status === "empty") {
          if ((payload.result.remaining ?? 0) > 0) {
            setImportError(
              `${payload.result.remaining} sentence transcription(s) need manual review or another retry.`,
            );
          }
          break;
        }
        processed += 1;
        if (payload.result.status === "failed") failed += 1;
        setTranscription({ running: true, processed, failed });
        if (processed % 5 === 0) await loadWorkflowStatus(true);
      }
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "AI transcription paused",
      );
    } finally {
      await loadWorkflowStatus(true);
      setTranscription((current) => ({ ...current, running: false }));
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
      {props.destinationFocus ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Course Library → VideoAsk migration
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {destinationFocused
                  ? focusedDestination ||
                    (placementPreview
                      ? "No automatic VideoAsk match was found for this destination."
                      : "Finding the VideoAsk source matched to this destination…")
                  : "Showing the complete migration workspace."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={courseLibraryReturnHref(props.destinationFocus)}>
                  <ChevronLeft /> Back to Course Library
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowAllPlacements((current) => !current)}
              >
                {destinationFocused
                  ? "Show all migration mappings"
                  : "Return to selected destination"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
                  ? formatVideoAskDateTime(props.lastValidatedAt)
                  : "Not checked yet"}
              </dd>
            </div>
          </dl>

          {props.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              The current access token expires {formatVideoAskDateTime(props.expiresAt)}.
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

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
        <p className="font-medium">VideoAsk is the source—not a separate course.</p>
        <p className="mt-1 text-emerald-700 dark:text-emerald-300">
          Coach videos and sentence content are staged privately, reviewed, and
          then published as native Vocal Hack components inside the existing CMB
          Lab course and module selected below.
        </p>
      </div>

      {status.inventory || status.project || status.imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Source sync</CardTitle>
            <CardDescription>
              VideoAsk source records and private media copies are tracked in
              Neon so the migration can resume safely. These records are staging,
              not a student-facing course.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
              <div><dt className="text-muted-foreground">Forms scanned</dt><dd className="text-lg font-semibold">{status.inventory?.formCount ?? 0}</dd></div>
              <div><dt className="text-muted-foreground">Forms staged</dt><dd className="text-lg font-semibold">{importSummary.completed}</dd></div>
              <div><dt className="text-muted-foreground">With warnings</dt><dd className="text-lg font-semibold">{importSummary.warnings}</dd></div>
              <div><dt className="text-muted-foreground">Failed</dt><dd className="text-lg font-semibold">{importSummary.failed}</dd></div>
              <div><dt className="text-muted-foreground">Private videos ready</dt><dd className="text-lg font-semibold">{status.media.ready ?? 0}</dd></div>
              <div><dt className="text-muted-foreground">Videos tracked</dt><dd className="text-lg font-semibold">{mediaTotal}</dd></div>
            </dl>
            {status.inventory?.completedAt ? (
              <p className="text-xs text-muted-foreground">
                Last complete source scan: {formatVideoAskDateTime(status.inventory.completedAt)}
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
            <Button
              type="button"
              size="sm"
              className="w-fit"
              onClick={() => loadPlacementPreview()}
              disabled={placementLoading || progress.running}
            >
              {placementLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MapPinned />
              )}
              {placementLoading
                ? "Building course plan…"
                : "Open blended-course plan"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {placementPreview ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <BookOpenCheck className="h-5 w-5 text-emerald-500" />
                Vocal Hack course placement
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPlacementPreview(null)}
              >
                Close
              </Button>
            </CardTitle>
            <CardDescription>
              {destinationFocused
                ? "Showing the VideoAsk source matched to the Course Library destination you selected."
                : "Read-only plan based on the six folders from the team Loom. No published lesson changes until the mapping and AI transcripts are reviewed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {destinationFocused ? (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Matching forms</dt>
                  <dd className="text-lg font-semibold">
                    {displayedPlacementForms.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sentence videos</dt>
                  <dd className="text-lg font-semibold">
                    {displayedPlacementForms.reduce(
                      (total, form) => total + form.stepCount,
                      0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Media ready</dt>
                  <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {displayedPlacementForms.reduce(
                      (total, form) => total + form.mediaReady,
                      0,
                    )}
                    /
                    {displayedPlacementForms.reduce(
                      (total, form) => total + form.stepCount,
                      0,
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
              <div>
                <dt className="text-muted-foreground">Course forms</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.targetTotal}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ignored workflows</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.ignoredTotal}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Exact</dt>
                <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {placementPreview.summary.exact}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">High confidence</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.high}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Needs review</dt>
                <dd className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                  {placementPreview.summary.review}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Manual</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.manual}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Media complete</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.mediaReady}/
                  {placementPreview.summary.targetTotal}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sentence videos</dt>
                <dd className="text-lg font-semibold">
                  {placementPreview.summary.targetSentenceVideos}
                </dd>
              </div>
              </dl>
            )}

            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-300">
              Existing VideoAsk transcripts are English phonetic guesses, so the
              {" "}
              {placementPreview.summary.aiTranscriptionRequired} coach videos
              need fresh Mandarin/Cantonese speech-to-text. Their private Blob
              copies will be reused—nothing needs to be uploaded again.
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <Button
                type="button"
                onClick={prepareReviewDrafts}
                disabled={
                  preparingWorkflow ||
                  transcription.running ||
                  (destinationFocused && displayedPlacementForms.length === 0)
                }
              >
                {preparingWorkflow ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <BookOpenCheck />
                )}
                {preparingWorkflow
                  ? "Preparing review drafts…"
                  : destinationFocused
                    ? displayedPlacementForms.length === 1
                      ? "Prepare this review draft"
                      : `Prepare ${displayedPlacementForms.length} review drafts`
                    : "Prepare review drafts"}
              </Button>
              <p className="max-w-2xl text-xs text-muted-foreground">
                {destinationFocused
                  ? "Only the match shown below will be staged. The selected Course Library lesson remains unchanged until you review and publish it."
                  : "This creates review records and sentence rows in staging only. Existing CMB Lab course lessons remain unchanged."}
              </p>
            </div>

            <div className="max-h-[38rem] overflow-auto rounded-md border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">VideoAsk source</th>
                    <th className="w-10 px-1 py-2">
                      <span className="sr-only">Maps to</span>
                    </th>
                    <th className="px-3 py-2 font-medium">CMB Lab destination</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPlacementForms.map((form) => (
                    <tr key={form.formImportId} className="border-t align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{form.sourceTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.sourceGroup} · {form.stepCount} sentence video
                          {form.stepCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-1 py-4 text-muted-foreground">
                        <ArrowRight className="h-4 w-4" />
                      </td>
                      <td className="px-3 py-3">
                        {form.targetCourse && form.targetModule ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {form.targetCourse.title}
                            </p>
                            <p className="font-medium">
                              {form.targetModule.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {form.targetLessonTitle}
                            </p>
                          </>
                        ) : (
                          <p className="font-medium text-amber-600 dark:text-amber-400">
                            Administrator must choose a course and module
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            form.confidence === "exact"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : form.confidence === "review"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                          }
                        >
                          {confidenceLabel(form.confidence)}
                        </span>
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                          {form.action === "replace_placeholder"
                            ? "Replace existing placeholder after review"
                            : form.action === "create_lesson"
                              ? "Add beside the matching course material"
                              : form.reason}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            form.mediaComplete
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {form.mediaComplete
                            ? `${form.mediaReady}/${form.stepCount} media ready`
                            : `${form.mediaReady}/${form.stepCount} media ready`}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          AI transcript pending
                        </p>
                      </td>
                    </tr>
                  ))}
                  {displayedPlacementForms.length === 0 ? (
                    <tr className="border-t">
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No automatic source match was found for this destination.
                        Show all migration mappings to review the unmatched forms.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {workflow && displayedWorkflowPlacements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>Vocal Hack review workflow</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => loadWorkflowStatus()}
                disabled={workflowLoading || transcription.running}
              >
                {workflowLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Refresh
              </Button>
            </CardTitle>
            <CardDescription>
              AI output stays in staging. Open each placement to correct the
              destination and sentence text, then publish that lesson explicitly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Placements</dt>
                <dd className="text-lg font-semibold">
                  {displayedWorkflowSummary.placements}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Awaiting AI</dt>
                <dd className="text-lg font-semibold">
                  {displayedWorkflowSummary.awaiting}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ready sentences</dt>
                <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {displayedWorkflowSummary.ready}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Needs attention</dt>
                <dd className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                  {displayedWorkflowSummary.needsAttention}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Published lessons</dt>
                <dd className="text-lg font-semibold">
                  {displayedWorkflowSummary.published}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-3">
              {transcription.running ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    transcriptionStopRequested.current = true;
                  }}
                >
                  <Pause /> Pause after this clip
                </Button>
              ) : (
                <Button type="button" onClick={runSafeTranscription}>
                  <Play /> Start/resume safe AI transcription
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {transcription.running || transcription.processed > 0
                  ? `${transcription.processed} processed this run · ${transcription.failed} failed`
                  : "Starts with exact and high-confidence mappings only."}
              </p>
            </div>

            <div className="max-h-[38rem] overflow-auto rounded-md border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">VideoAsk source</th>
                    <th className="px-3 py-2 font-medium">CMB Lab destination</th>
                    <th className="px-3 py-2 font-medium">Sentence review</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedWorkflowPlacements.map((placement) => (
                    <tr key={placement.id} className="border-t align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{placement.sourceTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {placement.sourceGroup} · {placement.language}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {placement.targetCourseTitle &&
                        placement.targetModuleTitle ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {placement.targetCourseTitle}
                            </p>
                            <p className="font-medium">
                              {placement.targetModuleTitle}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {placement.targetLessonTitle}
                            </p>
                          </>
                        ) : (
                          <p className="text-amber-600 dark:text-amber-400">
                            Destination required
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">
                          {placement.readySentences}/{placement.totalSentences}
                          {" "}ready
                        </p>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {statusLabel(placement.status)}
                        </p>
                        {placement.lastError ? (
                          <p className="mt-1 max-w-xs text-xs text-destructive">
                            {placement.lastError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/integrations/videoask/vocal-hack/${placement.id}`}
                          >
                            <Eye />
                            {placement.status === "published"
                              ? "View audit"
                              : "Review"}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        <details className="group rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground marker:hidden">
            Advanced source ingestion ({forms.length} VideoAsk forms)
            <span className="ml-2 text-xs font-normal">
              — only needed when new source forms have not been staged yet
            </span>
          </summary>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>VideoAsk source inventory</CardTitle>
              <CardDescription>
                Select only source forms that still need to be copied into
                private staging. This does not publish a student course; use the
                blended-course plan above to place staged content into native
                Vocal Hack components.
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
                Stage selected ({selectedForms.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => runImport(forms)}
                disabled={progress.running || forms.length === 0}
              >
                <RefreshCw /> Resume full source sync ({forms.length})
              </Button>
              <span className="text-xs text-muted-foreground">
                Staging never changes the live Course Library.
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
        </details>
      ) : null}
    </div>
  );
}
