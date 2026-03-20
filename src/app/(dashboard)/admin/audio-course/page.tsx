import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { AudioCourseManager } from "@/components/admin/AudioCourseManager";

export default async function AdminAudioCoursePage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Audio Course Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Build series, manage lesson order, and define student listening instructions with external platform options.
        </p>
      </div>
      <AudioCourseManager />
    </div>
  );
}
