import { redirect } from "next/navigation";
import { checkRole } from "@/lib/auth";
import { CoachingScheduleAdminClient } from "./CoachingScheduleAdminClient";

export default async function CoachingScheduleAdminPage() {
  if (!(await checkRole("admin"))) redirect("/admin/manage");
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Group Coaching Schedule
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Publish live sessions to everyone or limit them to selected package tags.
        </p>
      </div>
      <CoachingScheduleAdminClient />
    </div>
  );
}
