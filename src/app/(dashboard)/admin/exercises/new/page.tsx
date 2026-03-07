import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { practiceSets } from "@/db/schema";
import { eq, isNull, and, desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { ExerciseFormClient } from "../ExerciseFormClient";

/**
 * New Exercise page - create a new exercise within a practice set.
 *
 * Reads `setId` from searchParams to know which practice set the exercise
 * belongs to. If no setId, shows a practice set selector.
 *
 * Access Control:
 * - Requires coach role
 */
export default async function NewExercisePage({
  searchParams,
}: {
  searchParams: Promise<{ setId?: string }>;
}) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { setId } = await searchParams;

  // If setId provided, verify it exists
  let selectedSet: typeof practiceSets.$inferSelect | null = null;
  if (setId) {
    const rows = await db
      .select()
      .from(practiceSets)
      .where(and(eq(practiceSets.id, setId), isNull(practiceSets.deletedAt)));
    selectedSet = rows[0] ?? null;

    // If set not found, redirect to exercises page
    if (!selectedSet) {
      redirect("/admin/exercises");
    }
  }

  // If no setId, fetch all sets for selection
  let allSets: (typeof practiceSets.$inferSelect)[] = [];
  if (!setId) {
    allSets = await db
      .select()
      .from(practiceSets)
      .where(isNull(practiceSets.deletedAt))
      .orderBy(desc(practiceSets.createdAt));
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/admin/exercises"
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </Link>

        {/* Practice set context */}
        {selectedSet && (
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
            <p className="text-sm text-zinc-400">
              Adding to:{" "}
              <span className="font-medium text-zinc-200">
                {selectedSet.title}
              </span>
            </p>
          </div>
        )}

        {/* If no setId, show set selector */}
        {!setId && (
          <div className="mb-6">
            {allSets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 px-6 py-12 text-center">
                <p className="text-sm text-zinc-400">
                  No practice sets found. Please{" "}
                  <Link
                    href="/admin/exercises"
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    create a practice set
                  </Link>{" "}
                  first before adding exercises.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  Select a practice set to add the exercise to:
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allSets.map((set) => (
                    <Link
                      key={set.id}
                      href={`/admin/exercises/new?setId=${set.id}`}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 transition-colors hover:border-zinc-500 hover:bg-zinc-700"
                    >
                      <h3 className="text-sm font-medium text-zinc-200">
                        {set.title}
                      </h3>
                      {set.description && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {set.description}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Exercise form */}
        {selectedSet && (
          <div className="max-w-2xl">
            <ExerciseFormClient practiceSetId={selectedSet.id} />
          </div>
        )}
      </div>
  );
}
