import { Skeleton } from "@/components/ui/skeleton";

export default function CoachDashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <Skeleton className="h-4 w-96 bg-zinc-800 mt-2" />
        </div>

        {/* Filter tabs skeleton */}
        <div className="flex gap-2 mb-6">
          <Skeleton className="h-9 w-20 bg-zinc-800 rounded-lg" />
          <Skeleton className="h-9 w-20 bg-zinc-800 rounded-lg" />
          <Skeleton className="h-9 w-20 bg-zinc-800 rounded-lg" />
        </div>

        {/* Submission card grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              {/* Type badge and status */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24 bg-zinc-800" />
                <Skeleton className="h-5 w-12 bg-zinc-800 rounded-full" />
              </div>
              {/* Title */}
              <Skeleton className="h-5 w-3/4 bg-zinc-800" />
              {/* Description */}
              <Skeleton className="h-4 w-full bg-zinc-800" />
              {/* Footer meta */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16 bg-zinc-800" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
