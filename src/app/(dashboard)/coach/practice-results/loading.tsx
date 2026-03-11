import { Skeleton } from "@/components/ui/skeleton";

export default function CoachPracticeResultsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Title skeleton */}
      <Skeleton className="h-7 w-64 bg-muted mb-2" />
      {/* Subtitle skeleton */}
      <Skeleton className="h-4 w-96 bg-muted mb-8" />

      {/* Filter bar skeleton */}
      <div className="mb-8 flex flex-wrap items-end gap-3">
        <Skeleton className="h-9 w-48 bg-muted rounded-md" />
        <Skeleton className="h-9 w-40 bg-muted rounded-md" />
        <Skeleton className="h-9 w-36 bg-muted rounded-md" />
        <Skeleton className="h-9 w-36 bg-muted rounded-md" />
        <Skeleton className="h-9 w-20 bg-muted rounded-md" />
        <Skeleton className="h-9 w-20 bg-muted rounded-md" />
        <Skeleton className="h-9 w-20 bg-muted rounded-md" />
        <Skeleton className="h-9 w-16 bg-muted rounded-md" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-6"
          >
            <Skeleton className="h-4 w-24 bg-muted mb-3" />
            <Skeleton className="h-8 w-16 bg-muted" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <Skeleton className="h-4 w-48 bg-muted mb-4" />
          <Skeleton className="h-[250px] w-full bg-muted rounded" />
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <Skeleton className="h-4 w-44 bg-muted mb-4" />
          <Skeleton className="h-[250px] w-full bg-muted rounded" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="w-full">
          {/* Header row */}
          <div className="flex gap-4 bg-muted px-4 py-3 border-b border-border">
            <Skeleton className="h-4 w-32 bg-muted" />
            <Skeleton className="h-4 w-36 bg-muted" />
            <Skeleton className="h-4 w-16 bg-muted" />
            <Skeleton className="h-4 w-16 bg-muted" />
            <Skeleton className="h-4 w-16 bg-muted" />
            <Skeleton className="h-4 w-20 bg-muted" />
            <Skeleton className="h-4 w-8 bg-muted" />
          </div>
          {/* Body rows */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex gap-4 px-4 py-3 border-b border-border"
            >
              <Skeleton className="h-4 w-32 bg-muted" />
              <Skeleton className="h-4 w-36 bg-muted" />
              <Skeleton className="h-4 w-16 bg-muted" />
              <Skeleton className="h-4 w-16 bg-muted" />
              <Skeleton className="h-4 w-16 bg-muted" />
              <Skeleton className="h-4 w-20 bg-muted" />
              <Skeleton className="h-4 w-8 bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
