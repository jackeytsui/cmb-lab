import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { AudioCourseClient } from "./AudioCourseClient";

export const metadata = {
  title: "Audio Courses - Canto to Mando Lab",
};

export default async function AudioCoursesPage() {
  // Any authenticated user can access (feature gating handled by sidebar)
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <AudioCourseClient />
    </div>
  );
}
