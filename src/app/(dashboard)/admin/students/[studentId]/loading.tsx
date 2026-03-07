import { Skeleton } from "@/components/ui/skeleton";

export default function AdminStudentDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link skeleton */}
      <Skeleton className="h-5 w-36 bg-zinc-800 mb-6" />

      {/* Student header skeleton */}
      <div className="flex items-center gap-4 mb-8">
        {/* Avatar */}
        <Skeleton className="h-16 w-16 bg-zinc-800 rounded-full" />
        <div>
          {/* Name */}
          <Skeleton className="h-7 w-48 bg-zinc-800" />
          {/* Email */}
          <Skeleton className="h-4 w-56 bg-zinc-800 mt-1" />
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-4 border-b border-zinc-800 mb-6">
        <Skeleton className="h-9 w-24 bg-zinc-800 rounded-t" />
        <Skeleton className="h-9 w-28 bg-zinc-800 rounded-t" />
        <Skeleton className="h-9 w-20 bg-zinc-800 rounded-t" />
      </div>

      {/* Content area skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between"
          >
            <div>
              <Skeleton className="h-5 w-40 bg-zinc-800" />
              <Skeleton className="h-4 w-56 bg-zinc-800 mt-1" />
            </div>
            <Skeleton className="h-8 w-20 bg-zinc-800 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
