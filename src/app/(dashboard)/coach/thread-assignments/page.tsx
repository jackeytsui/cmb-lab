import { redirect } from "next/navigation";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { listCoachThreadAssignments } from "@/lib/thread-assignments";
import { ThreadAssignmentsClient } from "./ThreadAssignmentsClient";

/**
 * Coach Thread Assignments page - server component.
 * Direct DB query (v7-14 pattern -- no self-fetch).
 */
export default async function CoachThreadAssignmentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/dashboard");
  }

  const assignments = await listCoachThreadAssignments(user.id);

  return (
    <div className="container mx-auto px-4 py-8">
      <ThreadAssignmentsClient initialAssignments={assignments} />
    </div>
  );
}
