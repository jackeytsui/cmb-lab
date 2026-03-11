import { Skeleton } from "@/components/ui/skeleton";

export default function CoachDashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <Skeleton className="h-4 w-96 bg-muted mt-2" />
        </div>

        {/* Filter tabs skeleton */}
        <div className="flex gap-2 mb-6">
          <Skeleton className="h-9 w-20 bg-muted rounded-lg" />
          <Skeleton className="h-9 w-20 bg-muted rounded-lg" />
          <Skeleton className="h-9 w-20 bg-muted rounded-lg" />
        </div>

        {/* Submission card grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-lg p-4 space-y-3"
            >
              {/* Type badge and status */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24 bg-muted" />
                <Skeleton className="h-5 w-12 bg-muted rounded-full" />
              </div>
              {/* Title */}
              <Skeleton className="h-5 w-3/4 bg-muted" />
              {/* Description */}
              <Skeleton className="h-4 w-full bg-muted" />
              {/* Footer meta */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16 bg-muted" />
                <Skeleton className="h-4 w-20 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
