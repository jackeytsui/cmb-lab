import { Skeleton } from "@/components/ui/skeleton";

export default function LessonPlayerLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-32 bg-zinc-800 mb-6" />

        {/* Lesson header skeleton */}
        <div className="mb-6">
          <Skeleton className="h-8 w-1/2 bg-zinc-800 mb-2" />
          <Skeleton className="h-4 w-1/3 bg-zinc-800" />
        </div>

        {/* Video player area skeleton */}
        <div className="rounded-lg overflow-hidden">
          <Skeleton className="aspect-video w-full bg-zinc-800" />
        </div>

        {/* Voice practice card skeleton */}
        <div className="mt-6 border border-zinc-800 rounded-lg p-6">
          <Skeleton className="h-6 w-48 bg-zinc-800 mb-4" />
          <Skeleton className="h-24 w-full bg-zinc-800" />
        </div>
      </div>
  );
}
