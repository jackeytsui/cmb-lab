import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Page title skeleton */}
      <Skeleton className="h-8 w-32 bg-muted mb-6" />

      {/* Settings card skeleton */}
      <div className="rounded-lg border border-border bg-card/70 p-6 space-y-6">
        {/* Language preference */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-40 bg-muted" />
          <Skeleton className="h-10 w-full bg-muted rounded-md" />
        </div>

        {/* Daily goal */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 bg-muted" />
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 bg-muted" />
          <Skeleton className="h-10 w-full bg-muted rounded-md" />
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-32 bg-muted" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-48 bg-muted" />
            <Skeleton className="h-6 w-10 bg-muted rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-44 bg-muted" />
            <Skeleton className="h-6 w-10 bg-muted rounded-full" />
          </div>
        </div>

        {/* Save button */}
        <Skeleton className="h-10 w-24 bg-muted rounded-md" />
      </div>
    </div>
  );
}
