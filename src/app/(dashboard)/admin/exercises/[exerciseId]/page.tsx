import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { practiceExercises, practiceSets } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { EditExerciseClient } from "./EditExerciseClient";

/**
 * Edit Exercise page - load existing exercise data into form with Edit/Preview tabs.
 *
 * Access Control:
 * - Requires coach role
 * - Redirects to /dashboard if not authorized
 *
 * Data Flow:
 * - Server component queries DB directly for exercise + parent practice set
 * - Passes data as props to EditExerciseClient (client wrapper)
 */
export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { exerciseId } = await params;

  // Fetch exercise directly from DB
  const exercise = await db
    .select()
    .from(practiceExercises)
    .where(
      and(
        eq(practiceExercises.id, exerciseId),
        isNull(practiceExercises.deletedAt)
      )
    )
    .then((rows) => rows[0] ?? null);

  if (!exercise) {
    notFound();
  }

  // Fetch parent practice set for context
  const parentSet = await db
    .select()
    .from(practiceSets)
    .where(
      and(
        eq(practiceSets.id, exercise.practiceSetId),
        isNull(practiceSets.deletedAt)
      )
    )
    .then((rows) => rows[0] ?? null);

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
        {parentSet && (
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
            <p className="text-sm text-zinc-400">
              Part of:{" "}
              <span className="font-medium text-zinc-200">
                {parentSet.title}
              </span>
            </p>
          </div>
        )}

        {/* Edit form with tabs */}
        <div className="max-w-2xl">
          <EditExerciseClient exercise={exercise} />
        </div>
      </div>
  );
}
