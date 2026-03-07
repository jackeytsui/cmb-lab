import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCoursesLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-32 bg-zinc-800 mb-4" />

      {/* Page header skeleton */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-48 bg-zinc-800 mt-2" />
        </div>
        <Skeleton className="h-10 w-28 bg-zinc-800 rounded-md" />
      </header>

      {/* Course list skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between"
          >
            <div className="min-w-0 flex-1">
              {/* Course title */}
              <Skeleton className="h-5 w-48 bg-zinc-800" />
              {/* Module count + status badge */}
              <div className="mt-1 flex items-center gap-3">
                <Skeleton className="h-4 w-20 bg-zinc-800" />
                <Skeleton className="h-5 w-16 bg-zinc-800 rounded-full" />
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16 bg-zinc-800 rounded-md" />
              <Skeleton className="h-8 w-16 bg-zinc-800 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
