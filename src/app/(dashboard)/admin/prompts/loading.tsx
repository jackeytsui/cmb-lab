import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPromptsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-36 bg-zinc-800 mb-6" />

      {/* Page header skeleton */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 bg-zinc-800 rounded-lg" />
          <Skeleton className="h-9 w-36 bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-72 bg-zinc-800" />
      </header>

      {/* Filter bar skeleton */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-24 bg-zinc-800 rounded-lg" />
        ))}
      </div>

      {/* Prompt list skeleton */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between"
          >
            <div className="flex-1">
              {/* Prompt name */}
              <Skeleton className="h-5 w-44 bg-zinc-800" />
              {/* Description */}
              <Skeleton className="h-4 w-64 bg-zinc-800 mt-1" />
            </div>
            <div className="flex items-center gap-3">
              {/* Type badge */}
              <Skeleton className="h-5 w-20 bg-zinc-800 rounded-full" />
              {/* Version + date */}
              <Skeleton className="h-4 w-12 bg-zinc-800" />
              <Skeleton className="h-4 w-24 bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
