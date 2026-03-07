import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Coaching materials page — server component with Clerk auth guard.
 *
 * Redirects unauthenticated users to /sign-in.
 * Authenticated users are redirected to the 1:1 coaching page.
 */
export default async function CoachingMaterialPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  redirect("/dashboard/coaching/one-on-one");
}
