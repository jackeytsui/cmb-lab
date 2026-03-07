import { Skeleton } from "@/components/ui/skeleton";

export default function ProgressLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Title */}
      <Skeleton className="h-8 w-48 bg-zinc-800" />

      {/* Overview stats bar skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <div className="flex flex-wrap gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-20 bg-zinc-800" />
              <Skeleton className="h-4 w-16 bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>

      {/* XP Timeline skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <Skeleton className="h-5 w-32 bg-zinc-800 mb-4" />
        <Skeleton className="h-[250px] w-full bg-zinc-800 rounded" />
      </div>

      {/* Heatmap skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <Skeleton className="h-5 w-24 bg-zinc-800 mb-4" />
        <Skeleton className="h-[140px] w-full bg-zinc-800 rounded" />
      </div>

      {/* Mastery skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <Skeleton className="h-5 w-24 bg-zinc-800 mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-48 bg-zinc-800" />
              <Skeleton className="h-2 w-full bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>

      {/* Badges skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <Skeleton className="h-5 w-20 bg-zinc-800 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Weekly summary skeleton */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <Skeleton className="h-5 w-36 bg-zinc-800 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24 bg-zinc-800" />
              <Skeleton className="h-8 w-16 bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
