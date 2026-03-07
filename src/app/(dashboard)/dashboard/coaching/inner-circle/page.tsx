import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { CoachingMaterialClient } from "../CoachingMaterialClient";
import { getCurrentUser } from "@/lib/auth";

export default async function InnerCircleCoachingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const currentUser = await getCurrentUser();

  return (
    <FeatureGate feature="coaching_material">
      <CoachingMaterialClient
        title="Inner Circle Group Coaching"
        subtitle="Shared materials for group coaching sessions."
        sessionType="inner-circle"
        currentRole={currentUser?.role}
      />
    </FeatureGate>
  );
}
