import { Skeleton } from "@/components/ui/skeleton";

export default function PracticeDashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-40 bg-zinc-800 mb-6" />

      {/* Page title skeleton */}
      <Skeleton className="h-8 w-48 bg-zinc-800 mb-2" />
      <Skeleton className="h-4 w-72 bg-zinc-800 mb-6" />

      {/* Filter bar skeleton */}
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-9 w-20 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-28 bg-zinc-800 rounded-lg" />
        <Skeleton className="h-9 w-24 bg-zinc-800 rounded-lg" />
      </div>

      {/* Assignment card grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 space-y-3"
          >
            {/* Title */}
            <Skeleton className="h-5 w-3/4 bg-zinc-800" />
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 bg-zinc-800 rounded-full" />
              <Skeleton className="h-4 w-20 bg-zinc-800" />
            </div>
            {/* Due date */}
            <Skeleton className="h-4 w-28 bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
