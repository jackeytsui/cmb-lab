import { Skeleton } from "@/components/ui/skeleton";

export default function AdminKnowledgeLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb skeleton */}
        <Skeleton className="h-4 w-40 mb-6 bg-zinc-800" />

        {/* Header skeleton */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg bg-zinc-800" />
              <Skeleton className="h-8 w-48 bg-zinc-800" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg bg-zinc-800" />
          </div>
          <Skeleton className="h-4 w-56 mt-2 bg-zinc-800" />
        </header>

        {/* Category tabs skeleton */}
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-8 w-16 rounded-md bg-zinc-800" />
          <Skeleton className="h-8 w-24 rounded-md bg-zinc-800" />
          <Skeleton className="h-8 w-20 rounded-md bg-zinc-800" />
          <Skeleton className="h-8 w-28 rounded-md bg-zinc-800" />
        </div>

        {/* Entry list skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-4"
            >
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-64 bg-zinc-700" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-20 rounded-full bg-zinc-700" />
                  <Skeleton className="h-4 w-32 bg-zinc-700" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 rounded-full bg-zinc-700" />
            </div>
          ))}
        </div>
    </div>
  );
}
