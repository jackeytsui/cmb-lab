import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Greeting skeleton */}
      <div className="mb-8">
        <Skeleton className="h-5 w-80 bg-zinc-800" />
      </div>

      {/* Stats section */}
      <section className="mb-12">
        <Skeleton className="h-6 w-24 mb-4 bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-700 bg-zinc-800 p-6"
            >
              <Skeleton className="h-9 w-16 mb-2 bg-zinc-700" />
              <Skeleton className="h-4 w-24 bg-zinc-700" />
            </div>
          ))}
        </div>
      </section>

      {/* Management section */}
      <section>
        <Skeleton className="h-6 w-28 mb-4 bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-700 bg-zinc-800 p-6"
            >
              <Skeleton className="h-12 w-12 mb-4 rounded-lg bg-zinc-700" />
              <Skeleton className="h-5 w-32 mb-2 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
