import { Skeleton } from "@/components/ui/skeleton";

export default function CoachStudentsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page subtitle skeleton */}
      <div className="mb-8">
        <Skeleton className="h-4 w-96 bg-zinc-800" />
      </div>

      {/* Search bar skeleton */}
      <div className="mb-6">
        <Skeleton className="h-10 w-72 bg-zinc-800 rounded-lg" />
      </div>

      {/* Tag filter skeleton */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 bg-zinc-800 rounded-full" />
        ))}
      </div>

      {/* Student table skeleton */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        {/* Table header */}
        <div className="bg-zinc-900 px-4 py-3 flex items-center gap-4">
          <Skeleton className="h-4 w-8 bg-zinc-800" />
          <Skeleton className="h-4 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-48 bg-zinc-800" />
          <Skeleton className="h-4 w-24 bg-zinc-800" />
          <Skeleton className="h-4 w-20 bg-zinc-800" />
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-center gap-4 border-t border-zinc-800"
          >
            {/* Avatar */}
            <Skeleton className="h-8 w-8 bg-zinc-800 rounded-full" />
            {/* Name */}
            <Skeleton className="h-4 w-28 bg-zinc-800" />
            {/* Email */}
            <Skeleton className="h-4 w-44 bg-zinc-800" />
            {/* Course access count */}
            <Skeleton className="h-4 w-16 bg-zinc-800" />
            {/* Tags */}
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14 bg-zinc-800 rounded-full" />
              <Skeleton className="h-5 w-16 bg-zinc-800 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
