import { Skeleton } from "@/components/ui/skeleton";

export default function CourseDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-32 bg-zinc-800 mb-6" />

        {/* Description skeleton */}
        <Skeleton className="h-4 w-2/3 bg-zinc-800 mb-8" />

        {/* Module sections skeleton */}
        <div className="space-y-8">
          {[1, 2].map((moduleIdx) => (
            <div key={moduleIdx}>
              {/* Module title */}
              <Skeleton className="h-6 w-48 bg-zinc-800 mb-4" />

              {/* Lesson rows */}
              <div className="space-y-2">
                {[1, 2, 3].map((lessonIdx) => (
                  <div
                    key={lessonIdx}
                    className="flex items-center gap-4 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4"
                  >
                    <Skeleton className="w-10 h-10 rounded-full bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-2/3 bg-zinc-800" />
                      <Skeleton className="h-4 w-1/2 bg-zinc-800" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
