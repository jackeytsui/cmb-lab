import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for My Feedback page.
 * Shows placeholder feedback cards while data loads.
 */
export default function MyFeedbackLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-40 mb-6 bg-zinc-800" />

        {/* Subtitle skeleton */}
        <div className="mb-8">
          <Skeleton className="h-4 w-64 bg-zinc-800" />
        </div>

        {/* Feedback card skeletons */}
        <div className="space-y-6 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-zinc-800 rounded-lg p-6"
            >
              {/* Header: coach name + date */}
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-5 w-32 bg-zinc-800" />
                <Skeleton className="h-4 w-24 bg-zinc-800" />
              </div>

              {/* Content lines */}
              <div className="space-y-2 mb-4">
                <Skeleton className="h-4 w-full bg-zinc-800" />
                <Skeleton className="h-4 w-3/4 bg-zinc-800" />
              </div>

              {/* Loom embed placeholder */}
              <Skeleton className="aspect-video h-48 w-full rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
  );
}
