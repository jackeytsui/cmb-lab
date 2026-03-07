import { redirect } from "next/navigation";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { listCoachVideoAssignments } from "@/lib/video-assignments";
import { VideoAssignmentsClient } from "./VideoAssignmentsClient";

import type { VideoAssignment } from "@/db/schema/video";

/**
 * Coach Video Assignments page - server component.
 * Direct DB query (v7-14 pattern -- no self-fetch).
 */
export default async function CoachVideoAssignmentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/dashboard");
  }

  const assignments = await listCoachVideoAssignments(user.id);

  return (
    <div className="container mx-auto px-4 py-8">
      <VideoAssignmentsClient
        initialAssignments={assignments as VideoAssignment[]}
      />
    </div>
  );
}
