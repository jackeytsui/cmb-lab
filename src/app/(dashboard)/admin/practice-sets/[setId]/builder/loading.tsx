import { Skeleton } from "@/components/ui/skeleton";

export default function PracticeSetBuilderLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-36 bg-zinc-800" />
          <Skeleton className="h-8 w-48 bg-zinc-800 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 bg-zinc-800 rounded-md" />
          <Skeleton className="h-9 w-20 bg-zinc-800 rounded-md" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Palette column */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <Skeleton className="h-5 w-28 bg-zinc-800 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-md border border-zinc-800/50"
                >
                  <Skeleton className="h-8 w-8 bg-zinc-800 rounded" />
                  <div>
                    <Skeleton className="h-4 w-24 bg-zinc-800" />
                    <Skeleton className="h-3 w-32 bg-zinc-800 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas column */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 min-h-[500px] p-6">
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
              <Skeleton className="h-12 w-12 bg-zinc-800 rounded-lg mb-4" />
              <Skeleton className="h-5 w-56 bg-zinc-800 mb-2" />
              <Skeleton className="h-4 w-72 bg-zinc-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
