import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolvePermissions, type FeatureKey } from "@/lib/permissions";
import { hasMinimumRole } from "@/lib/auth";
import { Lock } from "lucide-react";
import {
  getUserFeatureTagOverrides,
  hasFeatureWithTagOverrides,
} from "@/lib/tag-feature-access";

// ---------------------------------------------------------------------------
// Human-readable labels for feature keys
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_conversation: "AI Conversation Bot",
  practice_sets: "Practice Sets",
  dictionary_reader: "Dictionary & Reader",
  listening_lab: "YouTube Listening Lab",
  coaching_material: "My Coaching Material",
  video_threads: "Video Threads",
  certificates: "Certificates",
  ai_chat: "AI Chat",
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
  // Get Clerk user
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return fallback ? <>{fallback}</> : null;
  }

  // Look up internal user
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) {
    return fallback ? <>{fallback}</> : null;
  }

  const featureTagOverrides = await getUserFeatureTagOverrides(user.id);
  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  let baseAllowed = false;

  if (
    forcedStudent &&
    (feature === "dictionary_reader" ||
      feature === "listening_lab" ||
      feature === "coaching_material")
  ) {
    baseAllowed = true;
  }

  if (!baseAllowed) {
    // Bypass feature gating for coaches and admins at role level
    const isCoachOrAbove = await hasMinimumRole("coach");
    if (isCoachOrAbove) {
      baseAllowed = true;
    }
  }

  if (!baseAllowed) {
    const permissions = await resolvePermissions(user.id);
    baseAllowed = permissions.canUseFeature(feature);
  }

  if (hasFeatureWithTagOverrides(feature, baseAllowed, featureTagOverrides)) {
    return <>{children}</>;
  }

  // Feature not permitted — show fallback
  return fallback ? (
    <>{fallback}</>
  ) : (
    <FeatureLockedFallback feature={feature} />
  );
}
