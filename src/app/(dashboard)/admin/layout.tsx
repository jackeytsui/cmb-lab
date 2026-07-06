import type { ReactNode } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { resolvePermissions } from "@/lib/permissions";

type Role = "student" | "coach" | "admin";

function normalizeRole(value: unknown): Role | null {
  return value === "admin" || value === "coach" || value === "student" ? value : null;
}

function roleFromSessionClaims(sessionClaims: unknown): Role | null {
  if (!sessionClaims || typeof sessionClaims !== "object") return null;
  const claims = sessionClaims as Record<string, unknown>;
  return (
    normalizeRole((claims.metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.public_metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.publicMetadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole(claims.role)
  );
}

function getClerkEmail(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  return (
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    null
  );
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  const email = getClerkEmail(clerkUser);
  const allowlistRole = resolveRoleFromEmail(email);
  const claimRole = roleFromSessionClaims(sessionClaims);
  const metadataRole = normalizeRole(
    (clerkUser?.publicMetadata as Record<string, unknown> | undefined)?.role
  );

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
    columns: { role: true },
  });

  const effectiveRole =
    (dbUser?.role as Role | undefined) ||
    claimRole ||
    metadataRole ||
    allowlistRole ||
    "student";

  const elevatedRole =
    effectiveRole === "student" && allowlistRole !== "student"
      ? allowlistRole
      : effectiveRole;

  if (elevatedRole !== "admin" && elevatedRole !== "coach") {
    // Assignment reviewers (e.g. the "Challenge Reviewer" role bundle) may
    // access admin content such as Assignment Submissions without being
    // coach/admin. Individual admin pages still enforce their own checks.
    const reviewerUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });
    const canReview = reviewerUser
      ? (await resolvePermissions(reviewerUser.id)).canUseFeature(
          "assignment_review_text",
        )
      : false;
    if (!canReview) redirect("/dashboard");
  }

  return <>{children}</>;
}
