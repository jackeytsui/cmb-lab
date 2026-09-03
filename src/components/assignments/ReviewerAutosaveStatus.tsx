import {
  CheckCircle2,
  Cloud,
  CloudAlert,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ReviewerAutosaveStatus as AutosaveStatus } from "@/hooks/useReviewerAutosave";

export function ReviewerAutosaveStatus({
  status,
  onRetry,
}: {
  status: AutosaveStatus;
  onRetry: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground"
    >
      {status === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "saved" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : status === "error" ? (
        <CloudAlert className="h-3.5 w-3.5 text-red-500" />
      ) : (
        <Cloud className="h-3.5 w-3.5" />
      )}
      <span>
        {status === "saving"
          ? "Saving draft…"
          : status === "saved"
            ? "Draft autosaved"
            : status === "pending"
              ? "Unsaved changes"
              : status === "error"
                ? "Autosave failed"
                : "Autosave on"}
      </span>
      {status === "error" && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-0.5 inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}
