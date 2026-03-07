import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Listening page.
 *
 * Shows placeholder UI while the listening page loads:
 * heading, URL input bar, video area, and caption status panel.
 * Content-area only (no sidebar/header) -- follows project convention.
 */
export default function ListeningLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Heading */}
      <div>
        <Skeleton className="h-8 w-56 bg-muted" />
        <Skeleton className="h-4 w-72 bg-muted mt-2" />
      </div>

      {/* URL input bar */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 bg-muted rounded-md" />
        <Skeleton className="h-10 w-28 bg-muted rounded-md" />
      </div>

      {/* Video + Caption panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video area */}
        <Skeleton className="aspect-video lg:col-span-2 bg-muted rounded-lg" />

        {/* Caption status panel */}
        <div className="space-y-4">
          <Skeleton className="h-24 w-full bg-muted rounded-lg" />
          <Skeleton className="h-32 w-full bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}
