import "server-only";

import { db } from "@/db";
import { roles, userRoles, users, roleCourses, roleFeatures, courses } from "@/db/schema";
import {
  eq,
  and,
  or,
  isNull,
  gt,
  lt,
  isNotNull,
  asc,
  count,
  inArray,
  sql,
} from "drizzle-orm";

// ---------------------------------------------------------------------------
// Feature Labels (re-export from shared module for backward compatibility)
// ---------------------------------------------------------------------------

export { FEATURE_LABELS } from "./feature-labels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  allCourses: boolean;
  activeStudentCount: number;
}

export interface ExpiringAssignment {
  userId: string;
  userName: string | null;
  userEmail: string;
  roleName: string;
  roleColor: string;
  expiresAt: Date;
}

export interface MultiRoleStudent {
  userId: string;
  name: string | null;
  email: string;
  roleCount: number;
  roles: { name: string; color: string; expiresAt: Date | null }[];
}

// ---------------------------------------------------------------------------
// 1. getRolesWithActiveStudentCounts
// ---------------------------------------------------------------------------

export async function getRolesWithActiveStudentCounts(): Promise<RoleSummary[]> {
  const now = new Date();

  // Get all non-deleted roles ordered by sortOrder then name
  const allRoles = await db
    .select()
    .from(roles)
    .where(isNull(roles.deletedAt))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  // Get active student counts grouped by roleId (filter expired)
  const activeCounts = await db
    .select({
      roleId: userRoles.roleId,
      count: count(),
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    )
    .groupBy(userRoles.roleId);

  const countMap = new Map(activeCounts.map((sc) => [sc.roleId, sc.count]));

  return allRoles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    color: role.color,
    allCourses: role.allCourses,
    activeStudentCount: countMap.get(role.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// 2. getExpiringAssignments
// ---------------------------------------------------------------------------

export async function getExpiringAssignments(
  withinDays: number
): Promise<ExpiringAssignment[]> {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const rows = await db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      roleName: roles.name,
      roleColor: roles.color,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        isNull(roles.deletedAt),
        isNotNull(userRoles.expiresAt),
        gt(userRoles.expiresAt, now),
        lt(userRoles.expiresAt, cutoff)
      )
    )
    .orderBy(asc(userRoles.expiresAt));

  return rows.map((row) => ({
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    roleName: row.roleName,
    roleColor: row.roleColor,
    expiresAt: row.expiresAt!,
  }));
}

// ---------------------------------------------------------------------------
// 3. getMultiRoleStudents
// ---------------------------------------------------------------------------

export async function getMultiRoleStudents(): Promise<MultiRoleStudent[]> {
  const now = new Date();

  // Step 1: Find users with more than one active role
  const multiRoleUserIds = await db
    .select({
      userId: userRoles.userId,
      roleCount: count().as("role_count"),
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    )
    .groupBy(userRoles.userId)
    .having(sql`count(*) > 1`);

  if (multiRoleUserIds.length === 0) {
    return [];
  }

  const userIdList = multiRoleUserIds.map((r) => r.userId);
  const countMap = new Map(
    multiRoleUserIds.map((r) => [r.userId, r.roleCount])
  );

  // Step 2: Batch-fetch all active assignments for those users
  const assignments = await db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      roleName: roles.name,
      roleColor: roles.color,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        inArray(userRoles.userId, userIdList),
        eq(users.role, "student"),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  // Step 3: Group by userId
  const grouped = new Map<
    string,
    {
      name: string | null;
      email: string;
      roles: { name: string; color: string; expiresAt: Date | null }[];
    }
  >();

  for (const row of assignments) {
    if (!grouped.has(row.userId)) {
      grouped.set(row.userId, {
        name: row.userName,
        email: row.userEmail,
        roles: [],
      });
    }
    grouped.get(row.userId)!.roles.push({
      name: row.roleName,
      color: row.roleColor,
      expiresAt: row.expiresAt,
    });
  }

  return Array.from(grouped.entries()).map(([userId, data]) => ({
    userId,
    name: data.name,
    email: data.email,
    roleCount: countMap.get(userId) ?? data.roles.length,
    roles: data.roles,
  }));
}

// ---------------------------------------------------------------------------
// 4. getAccessAttribution (admin view -- per-student role breakdown)
// ---------------------------------------------------------------------------

export interface AccessAttributionRole {
  roleId: string;
  roleName: string;
  roleColor: string;
  allCourses: boolean;
  expiresAt: Date | null;
  courses: {
    courseId: string;
    courseTitle: string;
    moduleId: string | null;
    lessonId: string | null;
    accessTier: "preview" | "full";
  }[];
  features: string[];
}

export async function getAccessAttribution(
  userId: string
): Promise<AccessAttributionRole[]> {
  const now = new Date();

  // Get active role assignments for this user
  const activeAssignments = await db
    .select({
      roleId: roles.id,
      roleName: roles.name,
      roleColor: roles.color,
      allCourses: roles.allCourses,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  if (activeAssignments.length === 0) return [];

  const roleIds = activeAssignments.map((a) => a.roleId);

  // Batch-fetch course grants and feature grants in parallel
  const [courseGrants, featureGrants] = await Promise.all([
    db
      .select({
        roleId: roleCourses.roleId,
        courseId: roleCourses.courseId,
        courseTitle: courses.title,
        moduleId: roleCourses.moduleId,
        lessonId: roleCourses.lessonId,
        accessTier: roleCourses.accessTier,
      })
      .from(roleCourses)
      .innerJoin(courses, eq(roleCourses.courseId, courses.id))
      .where(inArray(roleCourses.roleId, roleIds)),

    db
      .select({
        roleId: roleFeatures.roleId,
        featureKey: roleFeatures.featureKey,
      })
      .from(roleFeatures)
      .where(inArray(roleFeatures.roleId, roleIds)),
  ]);

  // Group by roleId
  const coursesByRole = new Map<string, AccessAttributionRole["courses"]>();
  for (const g of courseGrants) {
    if (!coursesByRole.has(g.roleId)) coursesByRole.set(g.roleId, []);
    coursesByRole.get(g.roleId)!.push({
      courseId: g.courseId,
      courseTitle: g.courseTitle,
      moduleId: g.moduleId,
      lessonId: g.lessonId,
      accessTier: g.accessTier,
    });
  }

  const featuresByRole = new Map<string, string[]>();
  for (const f of featureGrants) {
    if (!featuresByRole.has(f.roleId)) featuresByRole.set(f.roleId, []);
    featuresByRole.get(f.roleId)!.push(f.featureKey);
  }

  return activeAssignments.map((a) => ({
    roleId: a.roleId,
    roleName: a.roleName,
    roleColor: a.roleColor,
    allCourses: a.allCourses,
    expiresAt: a.expiresAt,
    courses: coursesByRole.get(a.roleId) ?? [],
    features: featuresByRole.get(a.roleId) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// 5. getStudentRoleView (student-facing -- safe data only)
// ---------------------------------------------------------------------------

export interface StudentRoleViewItem {
  name: string;
  color: string;
  description: string | null;
  allCourses: boolean;
  expiresAt: Date | null;
  courses: { courseTitle: string; accessTier: "preview" | "full" }[];
  features: string[];
}

export async function getStudentRoleView(
  userId: string
): Promise<StudentRoleViewItem[]> {
  const now = new Date();

  // Get active role assignments with role metadata
  const activeAssignments = await db
    .select({
      roleId: roles.id,
      roleName: roles.name,
      roleColor: roles.color,
      roleDescription: roles.description,
      allCourses: roles.allCourses,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  if (activeAssignments.length === 0) return [];

  const roleIds = activeAssignments.map((a) => a.roleId);

  // Batch-fetch course grants and feature grants
  const [courseGrants, featureGrants] = await Promise.all([
    db
      .select({
        roleId: roleCourses.roleId,
        courseTitle: courses.title,
        accessTier: roleCourses.accessTier,
      })
      .from(roleCourses)
      .innerJoin(courses, eq(roleCourses.courseId, courses.id))
      .where(inArray(roleCourses.roleId, roleIds)),

    db
      .select({
        roleId: roleFeatures.roleId,
        featureKey: roleFeatures.featureKey,
      })
      .from(roleFeatures)
      .where(inArray(roleFeatures.roleId, roleIds)),
  ]);

  // Group by roleId
  const coursesByRole = new Map<
    string,
    { courseTitle: string; accessTier: "preview" | "full" }[]
  >();
  for (const g of courseGrants) {
    if (!coursesByRole.has(g.roleId)) coursesByRole.set(g.roleId, []);
    coursesByRole.get(g.roleId)!.push({
      courseTitle: g.courseTitle,
      accessTier: g.accessTier,
    });
  }

  const featuresByRole = new Map<string, string[]>();
  for (const f of featureGrants) {
    if (!featuresByRole.has(f.roleId)) featuresByRole.set(f.roleId, []);
    featuresByRole.get(f.roleId)!.push(f.featureKey);
  }

  // Strip admin-sensitive fields (no roleId, courseId, moduleId, lessonId, assignedBy)
  return activeAssignments.map((a) => ({
    name: a.roleName,
    color: a.roleColor,
    description: a.roleDescription,
    allCourses: a.allCourses,
    expiresAt: a.expiresAt,
    courses: coursesByRole.get(a.roleId) ?? [],
    features: featuresByRole.get(a.roleId) ?? [],
  }));
}
