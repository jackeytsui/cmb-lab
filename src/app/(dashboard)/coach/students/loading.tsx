import { Skeleton } from "@/components/ui/skeleton";

export default function CoachStudentsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-96 bg-muted" />
      </div>

      {/* Search bar skeleton */}
      <div className="mb-6">
        <Skeleton className="h-10 w-72 bg-muted rounded-lg" />
      </div>

      {/* Tag filter skeleton */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>

      {/* Student table skeleton */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Table header */}
        <div className="bg-card px-4 py-3 flex items-center gap-4">
          <Skeleton className="h-4 w-8 bg-muted" />
          <Skeleton className="h-4 w-32 bg-muted" />
          <Skeleton className="h-4 w-48 bg-muted" />
          <Skeleton className="h-4 w-24 bg-muted" />
          <Skeleton className="h-4 w-20 bg-muted" />
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-center gap-4 border-t border-border"
          >
            {/* Avatar */}
            <Skeleton className="h-8 w-8 bg-muted rounded-full" />
            {/* Name */}
            <Skeleton className="h-4 w-28 bg-muted" />
            {/* Email */}
            <Skeleton className="h-4 w-44 bg-muted" />
            {/* Course access count */}
            <Skeleton className="h-4 w-16 bg-muted" />
            {/* Tags */}
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14 bg-muted rounded-full" />
              <Skeleton className="h-5 w-16 bg-muted rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
