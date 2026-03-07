import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { practiceSets, practiceExercises } from "@/db/schema";
import { isNull, desc, asc } from "drizzle-orm";

import { ExerciseListClient } from "./ExerciseListClient";

/**
 * Admin Exercise Management page - displays practice sets with their exercises.
 *
 * Access Control:
 * - Requires coach role (coaches and admins)
 * - Non-coaches are redirected to /dashboard
 *
 * Data Flow:
 * - Server component queries DB directly (no self-fetch via API routes)
 * - Passes data as props to ExerciseListClient
 * - Client component handles mutations only (create set, delete exercise)
 */
export default async function ExercisesPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Fetch practice sets directly from DB (server component, no self-fetch)
  const allSets = await db
    .select()
    .from(practiceSets)
    .where(isNull(practiceSets.deletedAt))
    .orderBy(desc(practiceSets.createdAt));

  // Fetch all exercises for these sets
  const setIds = allSets.map((s) => s.id);
  let allExercises: (typeof practiceExercises.$inferSelect)[] = [];

  if (setIds.length > 0) {
    allExercises = await db
      .select()
      .from(practiceExercises)
      .where(isNull(practiceExercises.deletedAt))
      .orderBy(asc(practiceExercises.sortOrder), asc(practiceExercises.createdAt));
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-zinc-400">
            Create and manage practice exercises grouped by practice sets. Use the Builder for visual drag-and-drop editing.
          </p>
        </div>

        <ExerciseListClient
          practiceSets={allSets}
          exercises={allExercises}
        />
      </div>
  );
}
