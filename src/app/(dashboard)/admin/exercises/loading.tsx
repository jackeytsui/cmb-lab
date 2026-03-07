import { Skeleton } from "@/components/ui/skeleton";

export default function AdminExercisesLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page subtitle skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-96 bg-zinc-800" />
      </div>

      {/* Action bar: create button */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-10 w-40 bg-zinc-800 rounded-md" />
        <Skeleton className="h-10 w-32 bg-zinc-800 rounded-md" />
      </div>

      {/* Practice set cards skeleton */}
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            {/* Set header */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-48 bg-zinc-800" />
                <Skeleton className="h-5 w-16 bg-zinc-800 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 bg-zinc-800 rounded-md" />
                <Skeleton className="h-8 w-8 bg-zinc-800 rounded-md" />
              </div>
            </div>
            {/* Exercise rows */}
            {[1, 2, 3].map((j) => (
              <div
                key={j}
                className="px-4 py-3 flex items-center gap-4 border-t border-zinc-800/50"
              >
                {/* Type icon */}
                <Skeleton className="h-8 w-8 bg-zinc-800 rounded" />
                {/* Title */}
                <Skeleton className="h-4 w-48 bg-zinc-800" />
                {/* Language tag */}
                <Skeleton className="h-5 w-20 bg-zinc-800 rounded-full" />
                {/* Spacer + actions */}
                <div className="ml-auto flex gap-2">
                  <Skeleton className="h-7 w-7 bg-zinc-800 rounded" />
                  <Skeleton className="h-7 w-7 bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
