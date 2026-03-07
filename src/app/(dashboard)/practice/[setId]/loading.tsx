import { Skeleton } from "@/components/ui/skeleton";

export default function PracticePlayerLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Page title skeleton */}
      <Skeleton className="h-8 w-64 bg-zinc-800 mb-2" />
      <Skeleton className="h-4 w-48 bg-zinc-800 mb-6" />

      {/* Progress bar skeleton */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-4 w-24 bg-zinc-800" />
          <Skeleton className="h-4 w-16 bg-zinc-800" />
        </div>
        <Skeleton className="h-2 w-full bg-zinc-800 rounded-full" />
      </div>

      {/* Exercise content area skeleton */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 space-y-6">
        {/* Exercise prompt */}
        <Skeleton className="h-6 w-3/4 bg-zinc-800" />
        <Skeleton className="h-4 w-full bg-zinc-800" />
        <Skeleton className="h-4 w-2/3 bg-zinc-800" />

        {/* Input area */}
        <Skeleton className="h-32 w-full bg-zinc-800 rounded-lg" />

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-4">
          <Skeleton className="h-10 w-24 bg-zinc-800 rounded-md" />
          <Skeleton className="h-10 w-24 bg-zinc-800 rounded-md" />
        </div>
      </div>
    </div>
  );
}
