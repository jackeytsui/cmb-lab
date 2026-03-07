import { Skeleton } from "@/components/ui/skeleton";

export default function MyConversationsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-40 bg-zinc-800 mb-6" />

      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-80 bg-zinc-800" />
      </div>

      {/* Conversation list skeleton */}
      <div className="space-y-4 max-w-3xl">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6"
          >
            {/* Lesson title */}
            <Skeleton className="h-5 w-1/2 bg-zinc-800" />
            {/* Course / module */}
            <Skeleton className="h-4 w-1/3 mt-2 bg-zinc-800" />
            {/* Meta row: time ago + duration */}
            <div className="mt-4 flex items-center gap-4">
              <Skeleton className="h-4 w-28 bg-zinc-800" />
              <Skeleton className="h-4 w-24 bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
