import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Reader page.
 *
 * Shows placeholder UI while the reader page loads:
 * title, toolbar bar, and reading area.
 * Content-area only (no sidebar/header) — follows project convention.
 */
export default function ReaderLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Title */}
      <Skeleton className="h-8 w-48 bg-muted" />

      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/80 p-2">
        <Skeleton className="h-8 w-28 bg-muted rounded-md" />
        <Skeleton className="h-6 w-px bg-border" />
        <div className="flex gap-0.5">
          <Skeleton className="h-7 w-16 bg-muted rounded-md" />
          <Skeleton className="h-7 w-20 bg-muted rounded-md" />
          <Skeleton className="h-7 w-12 bg-muted rounded-md" />
        </div>
        <Skeleton className="h-6 w-px bg-border" />
        <div className="flex gap-0.5">
          <Skeleton className="h-7 w-8 bg-muted rounded-md" />
          <Skeleton className="h-7 w-8 bg-muted rounded-md" />
        </div>
        <Skeleton className="h-6 w-px bg-border" />
        <div className="flex gap-1 items-center">
          <Skeleton className="h-6 w-6 bg-muted rounded-md" />
          <Skeleton className="h-4 w-8 bg-muted" />
          <Skeleton className="h-6 w-6 bg-muted rounded-md" />
        </div>
      </div>

      {/* Reading area skeleton */}
      <Skeleton className="h-[400px] w-full bg-muted rounded-lg" />
    </div>
  );
}
