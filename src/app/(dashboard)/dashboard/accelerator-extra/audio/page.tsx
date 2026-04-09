import { FeatureGate } from "@/components/auth/FeatureGate";
import { AudioCourseClient } from "@/app/(dashboard)/dashboard/audio-courses/AudioCourseClient";

export default function AudioAcceleratorPage() {
  return (
    <FeatureGate feature="audio_accelerator_edition">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Audio-only Accelerator Edition
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audio lessons designed to complement your Mandarin Accelerator journey.
          </p>
        </div>
        <AudioCourseClient apiBaseUrl="/api/accelerator-extra/audio-courses" />
      </div>
    </FeatureGate>
  );
}
