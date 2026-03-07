import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAnalyticsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page title skeleton */}
      <Skeleton className="h-8 w-48 bg-zinc-800 mb-2" />
      <Skeleton className="h-4 w-64 bg-zinc-800 mb-6" />

      {/* Date filter skeleton */}
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="h-10 w-36 bg-zinc-800 rounded-md" />
        <Skeleton className="h-10 w-36 bg-zinc-800 rounded-md" />
        <Skeleton className="h-10 w-24 bg-zinc-800 rounded-md" />
      </div>

      {/* Stat cards grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-700 bg-zinc-800 p-6"
          >
            <Skeleton className="h-4 w-24 bg-zinc-700 mb-2" />
            <Skeleton className="h-9 w-16 bg-zinc-700" />
          </div>
        ))}
      </div>

      {/* Chart area skeleton */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <Skeleton className="h-5 w-36 bg-zinc-800 mb-4" />
        <Skeleton className="h-64 w-full bg-zinc-800 rounded-lg" />
      </div>
    </div>
  );
}
