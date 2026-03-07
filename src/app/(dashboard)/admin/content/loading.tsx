import { Skeleton } from "@/components/ui/skeleton";

export default function AdminContentLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-56 bg-zinc-800" />
          <Skeleton className="h-4 w-72 bg-zinc-800 mt-1" />
        </div>
        <Skeleton className="h-4 w-32 bg-zinc-800" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        <Skeleton className="h-8 w-20 bg-zinc-800 rounded" />
        <Skeleton className="h-8 w-24 bg-zinc-800 rounded" />
        <Skeleton className="h-8 w-20 bg-zinc-800 rounded" />
      </div>

      {/* Video card grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            {/* Thumbnail */}
            <Skeleton className="aspect-video w-full bg-zinc-800" />
            {/* Card content */}
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-3/4 bg-zinc-800" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 bg-zinc-800 rounded-full" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
