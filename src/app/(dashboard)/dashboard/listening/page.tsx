import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ListeningClient } from "./ListeningClient";
import { FeatureGate } from "@/components/auth/FeatureGate";

/**
 * Listening page -- server component with Clerk auth guard.
 *
 * Redirects unauthenticated users to /sign-in.
 * Video loading and caption extraction are client-driven,
 * so no server-side data fetching is needed here.
 *
 * Feature-gated: requires "listening_lab" permission.
 */
export default async function ListeningPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <FeatureGate feature="listening_lab">
      <ListeningClient />
    </FeatureGate>
  );
}
