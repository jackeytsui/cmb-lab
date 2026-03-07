import { Skeleton } from "@/components/ui/skeleton";

export default function AdminGhlLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-80 bg-zinc-800 mt-2" />
      </div>

      <div className="space-y-8">
        {/* Section 1: Connection status card skeleton */}
        <section>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-40 bg-zinc-800" />
              <Skeleton className="h-8 w-28 bg-zinc-800 rounded-md" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-3 bg-zinc-800 rounded-full" />
              <Skeleton className="h-4 w-32 bg-zinc-800" />
            </div>
          </div>
        </section>

        {/* Section 2: Field mapping table skeleton */}
        <section>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-44 bg-zinc-800" />
              <Skeleton className="h-8 w-32 bg-zinc-800 rounded-md" />
            </div>
            {/* Table rows */}
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-2 border-b border-zinc-800/50"
                >
                  <Skeleton className="h-4 w-32 bg-zinc-800" />
                  <Skeleton className="h-4 w-8 bg-zinc-800" />
                  <Skeleton className="h-4 w-40 bg-zinc-800" />
                  <div className="ml-auto">
                    <Skeleton className="h-7 w-7 bg-zinc-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Auto-tag rules skeleton */}
        <section>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <Skeleton className="h-6 w-32 bg-zinc-800 mb-1" />
            <Skeleton className="h-4 w-72 bg-zinc-800 mb-4" />
            <Skeleton className="h-24 w-full bg-zinc-800 rounded-lg" />
          </div>
        </section>

        {/* Section 4: Sync event log skeleton */}
        <section>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <Skeleton className="h-6 w-36 bg-zinc-800 mb-4" />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-2 border-b border-zinc-800/50"
              >
                <Skeleton className="h-4 w-24 bg-zinc-800" />
                <Skeleton className="h-4 w-16 bg-zinc-800" />
                <Skeleton className="h-4 w-48 bg-zinc-800" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
