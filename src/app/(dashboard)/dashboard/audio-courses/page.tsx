import { FeatureGate } from "@/components/auth/FeatureGate";
import { AudioCourseClient } from "./AudioCourseClient";

export const metadata = {
  title: "Audio Courses - Canto to Mando Lab",
};

export default function AudioCoursesPage() {
  return (
    <FeatureGate feature="audio_courses">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <AudioCourseClient />
      </div>
    </FeatureGate>
  );
}
