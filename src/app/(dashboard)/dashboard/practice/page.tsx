import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStudentAssignments } from "@/lib/assignments";

import { ErrorAlert } from "@/components/ui/error-alert";
import { PracticeDashboard } from "@/components/practice/assignments/PracticeDashboard";
import { FeatureGate } from "@/components/auth/FeatureGate";

/**
 * Student practice dashboard page.
 * Lists all assigned practice sets resolved through 5 assignment paths.
 * Server component that queries database directly (no self-fetch).
 */
export default async function PracticePage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/sign-in");
  }

  // Look up the internal user by Clerk ID
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!dbUser) {
    redirect("/sign-in");
  }

  let assignments;
  let loadError = false;

  try {
    assignments = await getStudentAssignments(dbUser.id);
  } catch (error) {
    console.error("Practice assignments failed to load:", error);
    loadError = true;
  }

  return (
    <FeatureGate feature="practice_sets">
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Link>

        {loadError ? (
          <ErrorAlert
            variant="block"
            message="Unable to load your practice assignments. Please try refreshing the page."
          />
        ) : (
          <PracticeDashboard assignments={assignments!} />
        )}
      </div>
    </FeatureGate>
  );
}
