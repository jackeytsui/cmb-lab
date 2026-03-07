import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-48 bg-zinc-800 mb-6" />

        {/* Subtitle skeleton */}
        <Skeleton className="h-4 w-72 bg-zinc-800 mb-8" />

        {/* Student filter skeleton */}
        <div className="mb-6">
          <Skeleton className="h-4 w-24 bg-zinc-800 mb-2" />
          <Skeleton className="h-10 w-72 bg-zinc-800 rounded-lg" />
        </div>

        {/* Conversation card list skeleton */}
        <div className="space-y-4 max-w-4xl">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6"
            >
              {/* Title */}
              <Skeleton className="h-5 w-2/3 bg-zinc-800" />
              {/* Subtitle */}
              <Skeleton className="h-4 w-1/2 bg-zinc-800 mt-1" />
              {/* Meta row */}
              <div className="mt-3 flex gap-4">
                <Skeleton className="h-4 w-24 bg-zinc-800" />
                <Skeleton className="h-4 w-32 bg-zinc-800" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
