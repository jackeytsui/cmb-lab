import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { GroupCoachingScheduleClient } from "./GroupCoachingScheduleClient";

export default async function GroupCoachingSchedulePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <FeatureGate feature="group_coaching_schedule">
      <GroupCoachingScheduleClient />
    </FeatureGate>
  );
}
