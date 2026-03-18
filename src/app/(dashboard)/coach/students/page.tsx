import { redirect } from "next/navigation";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, isNull, or, eq } from "drizzle-orm";
import { CoachStudentsClient } from "./CoachStudentsClient";
import { ErrorAlert } from "@/components/ui/error-alert";

/**
 * Coach Students page — enhanced management tool.
 *
 * Features:
 * - Coaches see their assigned students with ratings
 * - Admins see all students, sortable by coach, with bulk assign
 * - Search by email/name
 * - Quick link to 1:1 coaching notes
 * - Average ratings for 1:1 and inner circle
 *
 * Access: coach+ role required
 */
export default async function CoachStudentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const currentDbUser = await getCurrentUser();
  if (!currentDbUser) {
    redirect("/dashboard");
  }

  const isAdmin = currentDbUser.role === "admin";

  // Fetch coaches list for the filter/assign dropdown
  let coaches: { id: string; name: string | null; email: string }[] = [];
  try {
    coaches = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(eq(users.role, "coach"), eq(users.role, "admin")),
        ),
      )
      .orderBy(users.name);
  } catch (err) {
    console.error("Failed to fetch coaches:", err);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CoachStudentsClient
        currentUserId={currentDbUser.id}
        isAdmin={isAdmin}
        coaches={coaches}
      />
    </div>
  );
}
