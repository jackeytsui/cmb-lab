import { Skeleton } from "@/components/ui/skeleton";

export default function CoachPronunciationLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-52 bg-zinc-800 mb-6" />

      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-96 bg-zinc-800" />
      </div>

      {/* Result card list skeleton */}
      <div className="space-y-4 max-w-4xl">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6"
          >
            {/* Header: student name + score */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <Skeleton className="h-5 w-36 bg-zinc-800" />
                <Skeleton className="h-4 w-48 bg-zinc-800 mt-1" />
              </div>
              <Skeleton className="h-8 w-12 bg-zinc-800" />
            </div>
            {/* Target phrase */}
            <Skeleton className="h-6 w-2/3 bg-zinc-800 mb-3" />
            {/* Sub-scores row */}
            <div className="flex gap-3">
              <Skeleton className="h-6 w-24 bg-zinc-800 rounded" />
              <Skeleton className="h-6 w-20 bg-zinc-800 rounded" />
              <Skeleton className="h-6 w-28 bg-zinc-800 rounded" />
            </div>
            {/* Date */}
            <Skeleton className="h-3 w-20 bg-zinc-800 mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
