import { db } from "@/db";
import { userRoles, roles } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

// --- User Role Assignment CRUD ---

/**
 * Get all active (non-deleted) role assignments for a user.
 * Returns role details (name, color, description) along with assignment metadata.
 */
export async function getUserRoles(userId: string) {
  return db
    .select({
      id: userRoles.id,
      roleId: userRoles.roleId,
      roleName: roles.name,
      roleColor: roles.color,
      roleDescription: roles.description,
      assignedBy: userRoles.assignedBy,
      expiresAt: userRoles.expiresAt,
      createdAt: userRoles.createdAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt)
      )
    );
}

/**
 * Assign a role to a user (upsert).
 * If the user already has this role, updates expiresAt and assignedBy.
 * If not, inserts a new assignment.
 */
export async function assignRole(
  userId: string,
  roleId: string,
  assignedBy: string | null,
  expiresAt?: Date
) {
  const existing = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
  });

  if (existing) {
    await db
      .update(userRoles)
      .set({ expiresAt: expiresAt ?? null, assignedBy })
      .where(eq(userRoles.id, existing.id));
    return { action: "updated" as const, id: existing.id };
  }

  const [inserted] = await db
    .insert(userRoles)
    .values({ userId, roleId, assignedBy, expiresAt: expiresAt ?? null })
    .returning({ id: userRoles.id });

  return { action: "created" as const, id: inserted.id };
}

/**
 * Remove a role assignment from a user.
 * Returns true if the assignment was found and deleted, false if not found.
 */
export async function removeRole(userId: string, roleId: string) {
  const deleted = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ id: userRoles.id });

  return deleted.length > 0;
}
