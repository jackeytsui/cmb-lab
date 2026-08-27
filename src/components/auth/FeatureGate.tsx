import type { FeatureKey } from "@/lib/permissions";
import { Lock } from "lucide-react";
import { userCanUseFeature } from "@/lib/feature-access";
import { getCurrentUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Human-readable labels for feature keys
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_conversation: "AI Conversation Bot",
  practice_sets: "Practice Sets",
  dictionary_reader: "Dictionary & Reader",
  audio_courses: "Audio Courses",
  listening_lab: "YouTube Listening Lab",
  coaching_material: "My Coaching Material",
  one_on_one_coaching: "1:1 Coaching",
  inner_circle_group_coaching: "Inner Circle Group Coaching",
  group_coaching_schedule: "Group Coaching Schedule",
  flashcards: "Flashcards",
  course_library: "Course Library",
  video_threads: "Video Threads",
  certificates: "Certificates",
  ai_chat: "AI Chat",
  mandarin_accelerator: "Mandarin Accelerator",
  audio_accelerator_edition: "Audio Accelerator Edition",
  tone_mastery: "Advanced Tone Mastery System",
  listening_training: "Native Speed Listening Comprehension Training",
  notepad: "Notepad",
  assignment_review_text: "Assignment Review (Text)",
  assignment_feedback: "Personalised Assignment Feedback",
  assignment_review_vocal: "Assignment Review (Vocal Hack)",
  assignment_review_diary: "Assignment Review (Diary)",
  lab_assistant: "CMB Lab Assistant",
};

// ---------------------------------------------------------------------------
// Default locked fallback (not exported)
// ---------------------------------------------------------------------------

function FeatureLockedFallback({ feature }: { feature: FeatureKey }) {
  const label = FEATURE_LABELS[feature] ?? feature;

  return (
    <div className="py-16 text-center">
      <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        {label} is Locked
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        This feature is not included in your current plan. Contact your coach to
        upgrade your access.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeatureGate — async Server Component
// ---------------------------------------------------------------------------

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export async function FeatureGate({
  feature,
  children,
  fallback,
}: FeatureGateProps) {
  // Learning-surface feature gates should mirror the selected View As user.
  // getCurrentUser only applies impersonation for a real administrator, so
  // authentication remains trustworthy while the preview stays faithful.
  const user = await getCurrentUser();
  if (!user) {
    return fallback ? <>{fallback}</> : null;
  }

  if (await userCanUseFeature(user, feature)) {
    return <>{children}</>;
  }

  // Feature not permitted — show fallback
  return fallback ? (
    <>{fallback}</>
  ) : (
    <FeatureLockedFallback feature={feature} />
  );
}
