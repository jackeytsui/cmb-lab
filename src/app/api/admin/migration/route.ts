import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  courseAccess,
  users,
  courses,
  roles,
  roleCourses,
  roleFeatures,
  userRoles,
} from "@/db/schema";
import { eq, and, or, isNull, gt, sql, max, like, inArray } from "drizzle-orm";
import { FEATURE_KEYS } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseTier {
  courseId: string;
  courseTitle: string;
  accessTier: "preview" | "full";
}

interface PatternPreview {
  fingerprint: string;
  courseNames: string[];
  courseTiers: CourseTier[];
  studentCount: number;
  studentIds: string[];
  studentEmails: string[];
  suggestedRoleName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the count of existing Legacy: roles.
 */
async function getLegacyRoleCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roles)
    .where(and(like(roles.name, "Legacy:%"), isNull(roles.deletedAt)));
  return result[0]?.count ?? 0;
}

/**
 * Analyze courseAccess records for students and group by access pattern.
 * Only includes students (role='student') with active (non-expired) grants.
 */
async function analyzePatterns(): Promise<{
  patterns: PatternPreview[];
  totalStudents: number;
}> {
  const now = new Date();

  // Query all active courseAccess for students, joined with course titles
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      courseId: courseAccess.courseId,
      courseTitle: courses.title,
      accessTier: courseAccess.accessTier,
    })
    .from(courseAccess)
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .innerJoin(courses, eq(courseAccess.courseId, courses.id))
    .where(
      and(
        eq(users.role, "student"),
        or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))
      )
    );

  // Group by user
  const userMap = new Map<
    string,
    {
      email: string;
      grants: { courseId: string; courseTitle: string; accessTier: "preview" | "full" }[];
    }
  >();

  for (const row of rows) {
    const existing = userMap.get(row.userId);
    if (existing) {
      existing.grants.push({
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        accessTier: row.accessTier,
      });
    } else {
      userMap.set(row.userId, {
        email: row.email,
        grants: [
          {
            courseId: row.courseId,
            courseTitle: row.courseTitle,
            accessTier: row.accessTier,
          },
        ],
      });
    }
  }

  // Build fingerprints and group users by pattern
  const patternMap = new Map<
    string,
    {
      courseTiers: CourseTier[];
      courseNames: string[];
      studentIds: string[];
      studentEmails: string[];
    }
  >();

  for (const [userId, userData] of userMap) {
    // Skip students with zero grants (shouldn't happen after filtering, but guard)
    if (userData.grants.length === 0) continue;

    // Sort grants by courseId to create deterministic fingerprint
    const sorted = [...userData.grants].sort((a, b) =>
      a.courseId.localeCompare(b.courseId)
    );
    const fingerprint = sorted
      .map((g) => `${g.courseId}:${g.accessTier}`)
      .join("|");

    const existing = patternMap.get(fingerprint);
    if (existing) {
      existing.studentIds.push(userId);
      existing.studentEmails.push(userData.email);
    } else {
      patternMap.set(fingerprint, {
        courseTiers: sorted.map((g) => ({
          courseId: g.courseId,
          courseTitle: g.courseTitle,
          accessTier: g.accessTier,
        })),
        courseNames: sorted.map((g) => g.courseTitle),
        studentIds: [userId],
        studentEmails: [userData.email],
      });
    }
  }

  // Build pattern previews
  const patterns: PatternPreview[] = [];
  for (const [fingerprint, data] of patternMap) {
    // Truncate role name if >3 courses
    let suggestedRoleName: string;
    if (data.courseNames.length <= 3) {
      suggestedRoleName = `Legacy: ${data.courseNames.join(" + ")}`;
    } else {
      const first3 = data.courseNames.slice(0, 3).join(" + ");
      suggestedRoleName = `Legacy: ${first3}... (+${data.courseNames.length - 3} more)`;
    }

    patterns.push({
      fingerprint,
      courseNames: data.courseNames,
      courseTiers: data.courseTiers,
      studentCount: data.studentEmails.length,
      studentIds: data.studentIds,
      studentEmails: data.studentEmails,
      suggestedRoleName,
    });
  }

  const totalStudents = new Set(
    patterns.flatMap((p) => p.studentEmails)
  ).size;

  return { patterns, totalStudents };
}

// ---------------------------------------------------------------------------
// GET: Preview migration analysis
// ---------------------------------------------------------------------------

export async function GET() {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingCount = await getLegacyRoleCount();
  const { patterns, totalStudents } = await analyzePatterns();

  return NextResponse.json({
    alreadyMigrated: false,
    existingRoleCount: existingCount,
    patterns,
    totalStudents,
    totalRolesToCreate: patterns.length,
  });
}

// ---------------------------------------------------------------------------
// POST: Execute migration or verify results
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = request.nextUrl.searchParams.get("action") ?? "execute";

  if (action === "verify") {
    return handleVerify();
  }

  return handleExecute();
}

// ---------------------------------------------------------------------------
// Execute: Create Legacy roles, course mappings, features, and user assignments
// ---------------------------------------------------------------------------

async function handleExecute() {
  const { patterns } = await analyzePatterns();

  if (patterns.length === 0) {
    return NextResponse.json({
      migrated: true,
      rolesCreated: 0,
      studentsAssigned: 0,
    });
  }

  let rolesCreated = 0;
  let studentsAssigned = 0;

  try {
    await db.transaction(async (tx) => {
      for (const pattern of patterns) {
        // Get next sortOrder
        const maxResult = await tx
          .select({ maxOrder: max(roles.sortOrder) })
          .from(roles)
          .where(isNull(roles.deletedAt));
        const nextOrder = (maxResult[0]?.maxOrder ?? 0) + 1;

        const roleHasMatchingPattern = async (roleId: string) => {
          const existingRows = await tx
            .select({
              courseId: roleCourses.courseId,
              accessTier: roleCourses.accessTier,
            })
            .from(roleCourses)
            .where(
              and(
                eq(roleCourses.roleId, roleId),
                isNull(roleCourses.moduleId),
                isNull(roleCourses.lessonId)
              )
            );
          const existingFingerprint = existingRows
            .sort((a, b) => a.courseId.localeCompare(b.courseId))
            .map((r) => `${r.courseId}:${r.accessTier}`)
            .join("|");
          return existingFingerprint === pattern.fingerprint;
        };

        const baseRoleName = pattern.suggestedRoleName;
        const fallbackRoleName = `${baseRoleName} [${pattern.fingerprint.slice(0, 12)}]`;

        const existingRoleByBaseName = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(
            and(
              eq(roles.name, baseRoleName),
              isNull(roles.deletedAt)
            )
          )
          .limit(1);

        let roleId: string | undefined = existingRoleByBaseName[0]?.id;
        if (roleId && !(await roleHasMatchingPattern(roleId))) {
          roleId = undefined;
        }

        if (!roleId) {
          const existingRoleByFallbackName = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(
              and(
                eq(roles.name, fallbackRoleName),
                isNull(roles.deletedAt)
              )
            )
            .limit(1);
          roleId = existingRoleByFallbackName[0]?.id;
          if (roleId && !(await roleHasMatchingPattern(roleId))) {
            roleId = undefined;
          }
        }

        if (!roleId) {
          const roleNameToCreate =
            existingRoleByBaseName.length > 0 ? fallbackRoleName : baseRoleName;
          const [createdRole] = await tx
            .insert(roles)
            .values({
              name: roleNameToCreate,
              description: `Auto-migrated from courseAccess records during v9.0 deploy. ${pattern.studentCount} student(s).`,
              color: "#9ca3af",
              sortOrder: nextOrder,
            })
            .returning({ id: roles.id });
          roleId = createdRole.id;
          rolesCreated += 1;
        }

        // Ensure roleCourses exist for this pattern (course-level grants only)
        const existingCourseRows = await tx
          .select({
            courseId: roleCourses.courseId,
            accessTier: roleCourses.accessTier,
          })
          .from(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              isNull(roleCourses.moduleId),
              isNull(roleCourses.lessonId)
            )
          );

        const existingCourseTierById = new Map(
          existingCourseRows.map((r) => [r.courseId, r.accessTier])
        );

        const courseRowsToInsert: {
          roleId: string;
          courseId: string;
          moduleId: null;
          lessonId: null;
          accessTier: "preview" | "full";
        }[] = [];

        for (const ct of pattern.courseTiers) {
          const existingTier = existingCourseTierById.get(ct.courseId);
          if (!existingTier) {
            courseRowsToInsert.push({
              roleId,
              courseId: ct.courseId,
              moduleId: null,
              lessonId: null,
              accessTier: ct.accessTier,
            });
          } else if (existingTier === "preview" && ct.accessTier === "full") {
            await tx
              .update(roleCourses)
              .set({ accessTier: "full" })
              .where(
                and(
                  eq(roleCourses.roleId, roleId),
                  eq(roleCourses.courseId, ct.courseId),
                  isNull(roleCourses.moduleId),
                  isNull(roleCourses.lessonId)
                )
              );
          }
        }

        if (courseRowsToInsert.length > 0) {
          await tx.insert(roleCourses).values(courseRowsToInsert);
        }

        // Ensure all feature keys exist
        const existingFeatureRows = await tx
          .select({ featureKey: roleFeatures.featureKey })
          .from(roleFeatures)
          .where(eq(roleFeatures.roleId, roleId));
        const existingFeatureSet = new Set(
          existingFeatureRows.map((r) => r.featureKey)
        );
        const featuresToInsert = FEATURE_KEYS.filter(
          (featureKey) => !existingFeatureSet.has(featureKey)
        );
        if (featuresToInsert.length > 0) {
          await tx.insert(roleFeatures).values(
            featuresToInsert.map((featureKey) => ({
              roleId,
              featureKey,
            }))
          );
        }

        // Assign students for this pattern
        const studentRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.role, "student"),
              inArray(users.id, pattern.studentIds)
            )
          );

        // Insert userRoles (idempotent)
        if (studentRows.length > 0) {
          const beforeCountRows = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.roleId, roleId),
                inArray(
                  userRoles.userId,
                  studentRows.map((s) => s.id)
                )
              )
            );
          const beforeCount = beforeCountRows[0]?.count ?? 0;

          await tx
            .insert(userRoles)
            .values(
              studentRows.map((s) => ({
                userId: s.id,
                roleId,
                assignedBy: null,
                expiresAt: null,
              }))
            )
            .onConflictDoNothing();

          const afterCountRows = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.roleId, roleId),
                inArray(
                  userRoles.userId,
                  studentRows.map((s) => s.id)
                )
              )
            );
          const afterCount = afterCountRows[0]?.count ?? 0;
          studentsAssigned += Math.max(0, afterCount - beforeCount);
        }
      }
    });

    return NextResponse.json({
      migrated: true,
      rolesCreated,
      studentsAssigned,
    });
  } catch (error) {
    console.error("[Migration] Execute error:", error);
    return NextResponse.json(
      {
        error: "Migration failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function resolveRoleOnlyPermissions(userId: string): Promise<{
  courseIds: Set<string>;
  hasWildcardAccess: boolean;
  canAccessCourse: (courseId: string) => boolean;
  canUseFeature: (featureKey: string) => boolean;
}> {
  const now = new Date();
  const activeAssignments = await db
    .select({
      roleId: userRoles.roleId,
      allCourses: roles.allCourses,
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

  const roleIds = activeAssignments.map((a) => a.roleId);
  const hasWildcardAccess = activeAssignments.some((a) => a.allCourses);

  const [roleCourseRows, roleFeatureRows] = await Promise.all([
    roleIds.length > 0 && !hasWildcardAccess
      ? db
          .select({ courseId: roleCourses.courseId })
          .from(roleCourses)
          .where(inArray(roleCourses.roleId, roleIds))
      : Promise.resolve([] as { courseId: string }[]),
    roleIds.length > 0
      ? db
          .select({ featureKey: roleFeatures.featureKey })
          .from(roleFeatures)
          .where(inArray(roleFeatures.roleId, roleIds))
      : Promise.resolve([] as { featureKey: string }[]),
  ]);

  const courseIds = new Set(roleCourseRows.map((r) => r.courseId));
  const features = new Set(roleFeatureRows.map((r) => r.featureKey));

  return {
    courseIds,
    hasWildcardAccess,
    canAccessCourse: (courseId: string) =>
      hasWildcardAccess || courseIds.has(courseId),
    canUseFeature: (featureKey: string) => features.has(featureKey),
  };
}

// ---------------------------------------------------------------------------
// Verify: Compare courseAccess grants against role-derived permissions only
// ---------------------------------------------------------------------------

async function handleVerify() {
  const now = new Date();

  // Get all students with active courseAccess
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      courseId: courseAccess.courseId,
    })
    .from(courseAccess)
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))
      )
    );

  // Group by student
  const studentMap = new Map<
    string,
    { email: string; courseIds: Set<string> }
  >();

  for (const row of rows) {
    const existing = studentMap.get(row.userId);
    if (existing) {
      existing.courseIds.add(row.courseId);
    } else {
      studentMap.set(row.userId, {
        email: row.email,
        courseIds: new Set([row.courseId]),
      });
    }
  }

  const results: {
    studentId: string;
    email: string;
    directCourseIds: string[];
    resolvedCourseIds: string[];
    missingCourses: string[];
    featuresMissing: string[];
    status: "pass" | "fail";
  }[] = [];

  for (const [studentId, data] of studentMap) {
    const permissions = await resolveRoleOnlyPermissions(studentId);
    const directCourseIds = Array.from(data.courseIds);

    // Check every courseId from courseAccess is accessible via resolved permissions
    const missingCourses = directCourseIds.filter(
      (cid) => !permissions.canAccessCourse(cid)
    );

    // Check all 7 feature keys are accessible
    const featuresMissing = FEATURE_KEYS.filter(
      (fk) => !permissions.canUseFeature(fk)
    );

    const resolvedCourseIds = Array.from(permissions.courseIds);
    const status =
      missingCourses.length === 0 && featuresMissing.length === 0
        ? "pass"
        : "fail";

    results.push({
      studentId,
      email: data.email,
      directCourseIds,
      resolvedCourseIds,
      missingCourses,
      featuresMissing,
      status,
    });
  }

  const totalChecked = results.length;
  const totalPassed = results.filter((r) => r.status === "pass").length;
  const totalFailed = results.filter((r) => r.status === "fail").length;

  return NextResponse.json({
    results,
    totalChecked,
    totalPassed,
    totalFailed,
  });
}
