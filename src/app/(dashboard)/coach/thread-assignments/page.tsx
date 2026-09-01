import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { listCoachThreadAssignments } from "@/lib/thread-assignments";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { ThreadAssignmentsClient } from "./ThreadAssignmentsClient";

/**
 * Coach Thread Assignments page - server component.
 * Direct DB query (v7-14 pattern -- no self-fetch).
 */
export default async function CoachThreadAssignmentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/home");
  }

  const access = await getStaffStudentAccessContext();
  if (access.status !== "authorized") {
    redirect("/home");
  }

  const assignments = await listCoachThreadAssignments(
    access.actor.role === "admin" ? null : access.actor.id,
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <ThreadAssignmentsClient initialAssignments={assignments} />
    </div>
  );
}
