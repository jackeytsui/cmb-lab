import { auth, currentUser } from "@clerk/nextjs/server";
import type { Roles } from "@/types/globals";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveRoleFromEmail } from "@/lib/access-control";

function getClerkEmail(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  return (
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    null
  );
}

function normalizeRole(value: unknown): Roles | null {
  return value === "admin" || value === "coach" || value === "student" ? value : null;
}

function roleFromSessionClaims(sessionClaims: unknown): Roles | null {
  if (!sessionClaims || typeof sessionClaims !== "object") return null;
  const claims = sessionClaims as Record<string, unknown>;
  return (
    normalizeRole((claims.metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.public_metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.publicMetadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole(claims.role)
  );
}

/**
 * Resolve the current user's role.
 * Uses database role first (source of truth), then falls back to session claims.
 */
async function resolveRole(): Promise<Roles> {
  const { sessionClaims, userId } = await auth();
  const clerkUser = await currentUser();
  const email = getClerkEmail(clerkUser);
  const allowlistRole = resolveRoleFromEmail(email);
  const claimsRole = roleFromSessionClaims(sessionClaims);
  const metadataRole = normalizeRole(
    (clerkUser?.publicMetadata as Record<string, unknown> | undefined)?.role
  );

  // Source of truth: database
  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { role: true },
    });
    if (user?.role === "admin" || user?.role === "coach") return user.role as Roles;
    if (user?.role === "student") {
      // Prevent stale DB role from downgrading known admins/coaches.
      if (claimsRole) return claimsRole;
      if (metadataRole) return metadataRole;
      if (allowlistRole !== "student") return allowlistRole;
      return "student";
    }
  }

  // Fallback: session claims (requires Clerk session token customization)
  if (claimsRole) return claimsRole;

  if (metadataRole) return metadataRole;

  // Final fallback: deterministic email allowlist mapping.
  // This keeps admin API authorization consistent with middleware route checks.
  if (email) return allowlistRole;

  return "student";
}

/**
 * Check if the current user has a specific role
 */
export async function checkRole(role: Roles): Promise<boolean> {
  return (await resolveRole()) === role;
}

/**
 * Check if the current user has at least the minimum required role
 * Role hierarchy: student < coach < admin
 */
export async function hasMinimumRole(minimumRole: Roles): Promise<boolean> {
  const userRole = await resolveRole();

  const roleHierarchy: Roles[] = ["student", "coach", "admin"];
  const userLevel = roleHierarchy.indexOf(userRole);
  const requiredLevel = roleHierarchy.indexOf(minimumRole);

  return userLevel >= requiredLevel;
}

/**
 * Get the current user from the database
 * Returns null if not authenticated or user not found
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  return user;
}
