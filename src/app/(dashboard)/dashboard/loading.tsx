import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <Skeleton className="h-9 w-72 bg-zinc-800" />
          <Skeleton className="h-5 w-48 bg-zinc-800 mt-2" />
        </div>

        {/* Course grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-zinc-800/50 border border-zinc-800 rounded-lg overflow-hidden"
            >
              {/* Thumbnail */}
              <Skeleton className="aspect-video w-full bg-zinc-800" />
              {/* Card content */}
              <div className="p-6 space-y-3">
                <Skeleton className="h-5 w-3/4 bg-zinc-800" />
                <Skeleton className="h-4 w-full bg-zinc-800" />
                <Skeleton className="h-2 w-full bg-zinc-800 mt-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
