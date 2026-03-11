import { Skeleton } from "@/components/ui/skeleton";

export default function CoachPronunciationLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-52 bg-muted mb-6" />

      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-96 bg-muted" />
      </div>

      {/* Result card list skeleton */}
      <div className="space-y-4 max-w-4xl">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-6"
          >
            {/* Header: student name + score */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <Skeleton className="h-5 w-36 bg-muted" />
                <Skeleton className="h-4 w-48 bg-muted mt-1" />
              </div>
              <Skeleton className="h-8 w-12 bg-muted" />
            </div>
            {/* Target phrase */}
            <Skeleton className="h-6 w-2/3 bg-muted mb-3" />
            {/* Sub-scores row */}
            <div className="flex gap-3">
              <Skeleton className="h-6 w-24 bg-muted rounded" />
              <Skeleton className="h-6 w-20 bg-muted rounded" />
              <Skeleton className="h-6 w-28 bg-muted rounded" />
            </div>
            {/* Date */}
            <Skeleton className="h-3 w-20 bg-muted mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
