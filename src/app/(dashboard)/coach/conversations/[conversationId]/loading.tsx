import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-48 bg-zinc-800 mb-6" />

      {/* Page header skeleton */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 bg-zinc-800" />
        <Skeleton className="h-4 w-56 bg-zinc-800 mt-2" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column - Info cards */}
        <div className="lg:col-span-1 space-y-6">
          {/* Student info card */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="border-b border-zinc-800 p-4">
              <Skeleton className="h-5 w-20 bg-zinc-800" />
            </div>
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-32 bg-zinc-800" />
              <Skeleton className="h-4 w-48 bg-zinc-800" />
            </div>
          </div>

          {/* Lesson context card */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="border-b border-zinc-800 p-4">
              <Skeleton className="h-5 w-32 bg-zinc-800" />
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Skeleton className="h-3 w-16 bg-zinc-800 mb-1" />
                <Skeleton className="h-4 w-40 bg-zinc-800" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-zinc-800 mb-1" />
                <Skeleton className="h-4 w-36 bg-zinc-800" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-zinc-800 mb-1" />
                <Skeleton className="h-4 w-44 bg-zinc-800" />
              </div>
            </div>
          </div>

          {/* Session info card */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="border-b border-zinc-800 p-4">
              <Skeleton className="h-5 w-28 bg-zinc-800" />
            </div>
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-44 bg-zinc-800" />
              <div>
                <Skeleton className="h-3 w-16 bg-zinc-800 mb-1" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-zinc-800 mb-1" />
                <Skeleton className="h-4 w-24 bg-zinc-800" />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Transcript */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="border-b border-zinc-800 p-4">
              <Skeleton className="h-5 w-28 bg-zinc-800" />
            </div>
            <div className="p-4 space-y-4">
              {/* Alternating message bubbles */}
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
                >
                  <Skeleton
                    className={`h-16 bg-zinc-800 rounded-lg ${
                      i % 2 === 0 ? "w-2/3" : "w-3/4"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
