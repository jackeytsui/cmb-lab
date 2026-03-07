import { db } from "@/db";
import { roles, userRoles } from "@/db/schema";
import { eq, and, isNull, ilike, asc, count, sql, max } from "drizzle-orm";
import type { Role } from "@/db/schema";

// --- Role CRUD ---

export async function getRoles(
  filters?: { search?: string }
): Promise<(Role & { studentCount: number })[]> {
  const conditions = [isNull(roles.deletedAt)];

  const trimmedSearch = filters?.search?.trim();
  if (trimmedSearch) {
    conditions.push(ilike(roles.name, `%${trimmedSearch}%`));
  }

  const allRoles = await db
    .select()
    .from(roles)
    .where(and(...conditions))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  // Get student counts grouped by roleId
  const studentCounts = await db
    .select({
      roleId: userRoles.roleId,
      count: count(),
    })
    .from(userRoles)
    .groupBy(userRoles.roleId);

  const countMap = new Map(
    studentCounts.map((sc) => [sc.roleId, sc.count])
  );

  return allRoles.map((role) => ({
    ...role,
    studentCount: countMap.get(role.id) ?? 0,
  }));
}

export async function getRoleById(roleId: string): Promise<Role | null> {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));

  return role ?? null;
}

export async function createRole(data: {
  name: string;
  description?: string;
  color: string;
  createdBy?: string;
}): Promise<Role> {
  // Auto-increment sortOrder: get max of non-deleted roles
  const [maxResult] = await db
    .select({ maxOrder: max(roles.sortOrder) })
    .from(roles)
    .where(isNull(roles.deletedAt));

  const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

  const [role] = await db
    .insert(roles)
    .values({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      color: data.color,
      sortOrder: nextOrder,
      createdBy: data.createdBy,
    })
    .returning();

  return role;
}

export async function updateRole(
  roleId: string,
  data: { name?: string; description?: string; color?: string; sortOrder?: number }
): Promise<Role | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description.trim() || null;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

  const [updated] = await db
    .update(roles)
    .set(updateData)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .returning();

  return updated ?? null;
}

export async function softDeleteRole(
  roleId: string
): Promise<{ deleted: boolean; reason?: string }> {
  // Check if any students are assigned this role
  const [result] = await db
    .select({ count: count() })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));

  const assignedCount = result?.count ?? 0;

  if (assignedCount > 0) {
    return {
      deleted: false,
      reason: `Cannot delete: ${assignedCount} student(s) are currently assigned this role`,
    };
  }

  // Get the role first to build the renamed name
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));

  if (!existingRole) {
    return { deleted: false, reason: "Role not found" };
  }

  // Soft-delete: set deletedAt and rename to free the unique name constraint
  await db
    .update(roles)
    .set({
      deletedAt: new Date(),
      name: `${existingRole.name}_deleted_${Date.now()}`,
    })
    .where(eq(roles.id, roleId));

  return { deleted: true };
}
