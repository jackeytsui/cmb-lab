import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Vocabulary page.
 *
 * Shows placeholder UI while the vocabulary page loads:
 * title, search bar, and vocabulary card rows.
 * Content-area only (no sidebar/header) -- follows project convention.
 */
export default function VocabularyLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Title */}
      <div>
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <Skeleton className="h-4 w-64 bg-zinc-800 mt-2" />
      </div>

      {/* Search input */}
      <Skeleton className="h-10 w-full bg-zinc-800 rounded-lg" />

      {/* Word count */}
      <Skeleton className="h-4 w-20 bg-zinc-800" />

      {/* Vocabulary card skeletons */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
          >
            {/* Character */}
            <div className="min-w-[60px]">
              <Skeleton className="h-7 w-10 bg-zinc-800" />
            </div>

            {/* Pronunciation + definition */}
            <div className="flex-1 space-y-2">
              <div className="flex gap-3">
                <Skeleton className="h-4 w-16 bg-zinc-800" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </div>
              <Skeleton className="h-4 w-3/4 bg-zinc-800" />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Skeleton className="h-7 w-7 bg-zinc-800 rounded-md" />
              <Skeleton className="h-7 w-7 bg-zinc-800 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
