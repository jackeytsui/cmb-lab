import { FeatureGate } from "@/components/auth/FeatureGate";
import { AudioCourseWalkthrough } from "@/components/audio-course/AudioCourseWalkthrough";
import { getAudioCourseWalkthrough } from "@/lib/audio-course-walkthrough";
import { AudioCourseClient } from "./AudioCourseClient";

export const metadata = {
  title: "Audio Courses - Canto to Mando Lab",
};

export default async function AudioCoursesPage() {
  const walkthrough = await getAudioCourseWalkthrough().catch((error) => {
    console.error("[audio-courses] walkthrough setting unavailable:", error);
    return null;
  });

  return (
    <FeatureGate feature="audio_courses">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div
          className={
            walkthrough
              ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]"
              : "mx-auto max-w-4xl"
          }
        >
          <main className="min-w-0">
            <AudioCourseClient />
          </main>
          {walkthrough && (
            <aside className="order-first lg:order-last lg:sticky lg:top-6">
              <AudioCourseWalkthrough version={walkthrough.version} />
            </aside>
          )}
        </div>
      </div>
    </FeatureGate>
  );
}
