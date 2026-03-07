import { Skeleton } from "@/components/ui/skeleton";

export default function SubmissionDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-48 bg-zinc-800 mb-6" />

        {/* Page header skeleton */}
        <Skeleton className="h-8 w-64 bg-zinc-800 mb-8" />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Submission Details (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student info card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="w-10 h-10 bg-zinc-800 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32 bg-zinc-800" />
                  <Skeleton className="h-4 w-48 bg-zinc-800" />
                </div>
              </div>
              <Skeleton className="h-4 w-40 bg-zinc-800" />
            </div>

            {/* Lesson context card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <Skeleton className="h-5 w-32 bg-zinc-800 mb-4" />
              <div className="space-y-3">
                <div>
                  <Skeleton className="h-3 w-20 bg-zinc-800 mb-1" />
                  <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                </div>
                <div>
                  <Skeleton className="h-3 w-20 bg-zinc-800 mb-1" />
                  <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                </div>
              </div>
            </div>

            {/* Response card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <Skeleton className="h-5 w-48 bg-zinc-800 mb-4" />
              <Skeleton className="h-32 w-full bg-zinc-800 rounded-lg" />
            </div>

            {/* AI grading card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <Skeleton className="h-5 w-24 bg-zinc-800 mb-4" />
              <div className="flex items-center gap-4 mb-4">
                <Skeleton className="h-12 w-20 bg-zinc-800 rounded-lg" />
                <Skeleton className="h-3 w-full bg-zinc-800 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full bg-zinc-800" />
                <Skeleton className="h-4 w-3/4 bg-zinc-800" />
              </div>
            </div>
          </div>

          {/* Right column - Coach Actions (1/3 width) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Feedback form card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
              <Skeleton className="h-5 w-40 bg-zinc-800" />
              <Skeleton className="h-10 w-full bg-zinc-800" />
              <Skeleton className="h-24 w-full bg-zinc-800" />
              <Skeleton className="h-10 w-full bg-zinc-800" />
            </div>

            {/* Notes panel card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
              <Skeleton className="h-5 w-40 bg-zinc-800" />
              <Skeleton className="h-10 w-full bg-zinc-800" />
              <Skeleton className="h-24 w-full bg-zinc-800" />
              <Skeleton className="h-10 w-full bg-zinc-800" />
            </div>
          </div>
        </div>
      </div>
  );
}
