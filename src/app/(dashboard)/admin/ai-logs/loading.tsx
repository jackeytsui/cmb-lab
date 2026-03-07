import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAILogsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb skeleton */}
        <Skeleton className="h-4 w-36 mb-6 bg-zinc-800" />

        {/* Header skeleton */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Skeleton className="w-10 h-10 rounded-lg bg-zinc-800" />
            <Skeleton className="h-8 w-52 bg-zinc-800" />
          </div>
          <Skeleton className="h-4 w-72 mt-2 bg-zinc-800" />
        </header>

        {/* Filter bar skeleton */}
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-9 w-40 rounded-lg bg-zinc-800" />
          <Skeleton className="h-9 w-28 rounded-lg bg-zinc-800" />
          <Skeleton className="h-9 w-28 rounded-lg bg-zinc-800" />
        </div>

        {/* Log rows skeleton */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-700 bg-zinc-800/80">
            <Skeleton className="h-4 w-32 bg-zinc-700" />
            <Skeleton className="h-4 w-24 bg-zinc-700" />
            <Skeleton className="h-4 w-48 bg-zinc-700" />
            <Skeleton className="h-4 w-16 bg-zinc-700" />
            <Skeleton className="h-4 w-24 bg-zinc-700" />
          </div>
          {/* Log rows */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-b border-zinc-700/50"
            >
              <Skeleton className="h-4 w-32 bg-zinc-700" />
              <Skeleton className="h-4 w-24 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
              <Skeleton className="h-4 w-16 bg-zinc-700" />
              <Skeleton className="h-4 w-24 bg-zinc-700" />
            </div>
          ))}
        </div>
    </div>
  );
}
