import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { portalAccessStatus } from "@/lib/portal-access";
import { cookies } from "next/headers";
import type { Roles } from "@/types/globals";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  DEFAULT_PLATFORM_ROLE,
  canManageCourseContent,
  canManageAcceleratorContent,
  hasMinimumPlatformRole,
} from "@/lib/platform-roles";

/**
 * Resolve the current user's role.
 * The database is the only authorization source of truth.
 */
async function resolveRole(): Promise<Roles> {
  const { userId } = await auth();

  // Source of truth: database
  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { role: true, deletedAt: true },
    });
    if (user) return user.deletedAt ? "student" : user.role;
  }

  return DEFAULT_PLATFORM_ROLE;
}

/**
 * Check if the current user has a specific role
 */
export async function checkRole(role: Roles): Promise<boolean> {
  return (await resolveRole()) === role;
}

/**
 * Check if the current user has at least the minimum required role
 * Student < staff roles < admin. Peer staff roles share the same access level.
 */
export async function hasMinimumRole(minimumRole: Roles): Promise<boolean> {
  const userRole = await resolveRole();

  return hasMinimumPlatformRole(userRole, minimumRole);
}

/** Authorize content editors from the real persisted role, never View As. */
export async function hasCourseContentAccess(): Promise<boolean> {
  return canManageCourseContent(await resolveRole());
}

/** Accelerator management uses the real database role, never View As. */
export async function hasAcceleratorManagementAccess(): Promise<boolean> {
  return canManageAcceleratorContent(await resolveRole());
}

const hasActiveStudentPortal = cache(async () => {
  const user = await currentUser();
  return Boolean(user && portalAccessStatus(user.publicMetadata) === "active");
});

/**
 * Get the real authenticated user from the database.
 * Always returns the actual Clerk user, ignoring View As impersonation.
 * Use this in API routes where authorization depends on the real user's role.
 */
export async function getRealUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.query.users.findFirst({
    where: and(eq(users.clerkId, userId), isNull(users.deletedAt)),
  });
  // Real student expiry never suppresses the record for a coach/admin actor.
  if (user?.role === "student" && !(await hasActiveStudentPortal())) return null;
  return user ?? null;
}

/**
 * Get the current user from the database.
 * When an admin is impersonating via "View As", returns the impersonated user instead.
 * Use this in page components where you want to show the impersonated perspective.
 * For API routes, prefer getRealUser() to ensure correct authorization.
 */
export async function getCurrentUser() {
  const realUser = await getRealUser();
  if (!realUser) return null;

  // If admin is impersonating another user via "View As", return that user
  if (realUser.role === "admin") {
    const cookieStore = await cookies();
    const viewAsUserId = cookieStore.get("view_as_user_id")?.value;
    if (viewAsUserId) {
      const impersonatedUser = await db.query.users.findFirst({
        where: eq(users.id, viewAsUserId),
      });
      if (impersonatedUser) return impersonatedUser;
    }
  }

  return realUser;
}
