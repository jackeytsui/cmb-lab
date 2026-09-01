import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { listCoachVideoAssignments } from "@/lib/video-assignments";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { VideoAssignmentsClient } from "./VideoAssignmentsClient";

import type { VideoAssignment } from "@/db/schema/video";

/**
 * Coach Video Assignments page - server component.
 * Direct DB query (v7-14 pattern -- no self-fetch).
 */
export default async function CoachVideoAssignmentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/home");
  }

  const access = await getStaffStudentAccessContext();
  if (access.status !== "authorized") {
    redirect("/home");
  }

  const assignments = await listCoachVideoAssignments(
    access.actor.role === "admin" ? null : access.actor.id,
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <VideoAssignmentsClient
        initialAssignments={assignments as VideoAssignment[]}
      />
    </div>
  );
}
