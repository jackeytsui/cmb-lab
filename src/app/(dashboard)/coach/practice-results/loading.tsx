import { Skeleton } from "@/components/ui/skeleton";

export default function CoachPracticeResultsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Title skeleton */}
      <Skeleton className="h-7 w-64 bg-zinc-800 mb-2" />
      {/* Subtitle skeleton */}
      <Skeleton className="h-4 w-96 bg-zinc-800 mb-8" />

      {/* Filter bar skeleton */}
      <div className="mb-8 flex flex-wrap items-end gap-3">
        <Skeleton className="h-9 w-48 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-40 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-36 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-20 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-20 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-20 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-16 bg-zinc-800 rounded-md" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6"
          >
            <Skeleton className="h-4 w-24 bg-zinc-800 mb-3" />
            <Skeleton className="h-8 w-16 bg-zinc-800" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <Skeleton className="h-4 w-48 bg-zinc-800 mb-4" />
          <Skeleton className="h-[250px] w-full bg-zinc-800 rounded" />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <Skeleton className="h-4 w-44 bg-zinc-800 mb-4" />
          <Skeleton className="h-[250px] w-full bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-x-auto rounded-lg border border-zinc-700">
        <div className="w-full">
          {/* Header row */}
          <div className="flex gap-4 bg-zinc-800 px-4 py-3 border-b border-zinc-700">
            <Skeleton className="h-4 w-32 bg-zinc-700" />
            <Skeleton className="h-4 w-36 bg-zinc-700" />
            <Skeleton className="h-4 w-16 bg-zinc-700" />
            <Skeleton className="h-4 w-16 bg-zinc-700" />
            <Skeleton className="h-4 w-16 bg-zinc-700" />
            <Skeleton className="h-4 w-20 bg-zinc-700" />
            <Skeleton className="h-4 w-8 bg-zinc-700" />
          </div>
          {/* Body rows */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex gap-4 px-4 py-3 border-b border-zinc-800"
            >
              <Skeleton className="h-4 w-32 bg-zinc-800" />
              <Skeleton className="h-4 w-36 bg-zinc-800" />
              <Skeleton className="h-4 w-16 bg-zinc-800" />
              <Skeleton className="h-4 w-16 bg-zinc-800" />
              <Skeleton className="h-4 w-16 bg-zinc-800" />
              <Skeleton className="h-4 w-20 bg-zinc-800" />
              <Skeleton className="h-4 w-8 bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
