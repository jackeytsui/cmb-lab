import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-48 bg-muted mb-6" />

      {/* Page header skeleton */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 bg-muted" />
        <Skeleton className="h-4 w-56 bg-muted mt-2" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column - Info cards */}
        <div className="lg:col-span-1 space-y-6">
          {/* Student info card */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <Skeleton className="h-5 w-20 bg-muted" />
            </div>
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-32 bg-muted" />
              <Skeleton className="h-4 w-48 bg-muted" />
            </div>
          </div>

          {/* Lesson context card */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <Skeleton className="h-5 w-32 bg-muted" />
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Skeleton className="h-3 w-16 bg-muted mb-1" />
                <Skeleton className="h-4 w-40 bg-muted" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-muted mb-1" />
                <Skeleton className="h-4 w-36 bg-muted" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-muted mb-1" />
                <Skeleton className="h-4 w-44 bg-muted" />
              </div>
            </div>
          </div>

          {/* Session info card */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <Skeleton className="h-5 w-28 bg-muted" />
            </div>
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-44 bg-muted" />
              <div>
                <Skeleton className="h-3 w-16 bg-muted mb-1" />
                <Skeleton className="h-4 w-20 bg-muted" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 bg-muted mb-1" />
                <Skeleton className="h-4 w-24 bg-muted" />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Transcript */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <Skeleton className="h-5 w-28 bg-muted" />
            </div>
            <div className="p-4 space-y-4">
              {/* Alternating message bubbles */}
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
                >
                  <Skeleton
                    className={`h-16 bg-muted rounded-lg ${
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
