import { Skeleton } from "@/components/ui/skeleton";

export default function AdminStudentsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb skeleton */}
        <Skeleton className="h-4 w-32 mb-6 bg-zinc-800" />

        {/* Header skeleton */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Skeleton className="w-10 h-10 rounded-lg bg-zinc-800" />
            <Skeleton className="h-8 w-48 bg-zinc-800" />
          </div>
          <Skeleton className="h-4 w-64 mt-2 bg-zinc-800" />
        </header>

        {/* Table skeleton */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-700 bg-zinc-800/80">
            <Skeleton className="h-4 w-48 bg-zinc-700" />
            <Skeleton className="h-4 w-32 bg-zinc-700" />
            <Skeleton className="h-4 w-24 bg-zinc-700" />
            <Skeleton className="h-4 w-20 bg-zinc-700" />
          </div>
          {/* Table rows */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-b border-zinc-700/50"
            >
              <Skeleton className="h-4 w-48 bg-zinc-700" />
              <Skeleton className="h-4 w-32 bg-zinc-700" />
              <Skeleton className="h-4 w-24 bg-zinc-700" />
              <Skeleton className="h-4 w-20 bg-zinc-700" />
            </div>
          ))}
        </div>
      </div>
  );
}
