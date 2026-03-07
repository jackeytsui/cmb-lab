import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { VideoPromptsClient } from "./VideoPromptsClient";

export default async function CoachVideoPromptsPage() {
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    redirect("/dashboard");
  }

  return <VideoPromptsClient />;
}
