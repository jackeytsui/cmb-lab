import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { CoachingMaterialClient } from "../CoachingMaterialClient";
import { getCurrentUser } from "@/lib/auth";

export default async function OneOnOneCoachingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const currentUser = await getCurrentUser();

  return (
    <FeatureGate feature="coaching_material">
      <CoachingMaterialClient
        title="1:1 Coaching"
        subtitle="Personalized materials for 1:1 coaching sessions."
        sessionType="one-on-one"
        currentRole={currentUser?.role}
      />
    </FeatureGate>
  );
}
