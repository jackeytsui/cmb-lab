import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRealUser } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isStaffRole } from "@/lib/platform-roles";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const dbUser = await getRealUser();

  if (!dbUser || !isStaffRole(dbUser.role)) {
    // Assignment reviewers (e.g. the "Challenge Reviewer" role bundle) may
    // access admin content such as Assignment Submissions without being
    // coach/admin. Individual admin pages still enforce their own checks.
    const canReview = dbUser
      ? (await resolvePermissions(dbUser.id)).canUseFeature(
          "assignment_review_text",
        )
      : false;
    if (!canReview) redirect("/home");
  }

  return <>{children}</>;
}
