import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { getRoleById, updateRole, softDeleteRole } from "@/lib/roles";
import { z } from "zod";
import { db } from "@/db";
import { courses, modules, lessons, roleCourses, roleFeatures } from "@/db/schema";
import { eq, asc, isNull, inArray } from "drizzle-orm";

const updateRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(100, "Role name must be 100 characters or less").optional(),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color").optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * GET /api/admin/roles/:roleId
 * Get a single role by ID.
 * When ?tree=true, also returns courseTree, courseGrants, and featureGrants.
 * Requires coach role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleId } = await params;
    const role = await getRoleById(roleId);

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const tree = request.nextUrl.searchParams.get("tree");
    if (tree !== "true") {
      return NextResponse.json({ role });
    }

    // Fetch course tree and permission grants in parallel
    const [allCourses, allModules, allLessons, courseGrantRows, featureGrantRows] = await Promise.all([
      db.select({ id: courses.id, title: courses.title })
        .from(courses)
        .where(isNull(courses.deletedAt))
        .orderBy(asc(courses.sortOrder)),
      db.select({ id: modules.id, title: modules.title, courseId: modules.courseId })
        .from(modules)
        .where(isNull(modules.deletedAt))
        .orderBy(asc(modules.sortOrder)),
      db.select({ id: lessons.id, title: lessons.title, moduleId: lessons.moduleId })
        .from(lessons)
        .where(isNull(lessons.deletedAt))
        .orderBy(asc(lessons.sortOrder)),
      db.select({
        courseId: roleCourses.courseId,
        moduleId: roleCourses.moduleId,
        lessonId: roleCourses.lessonId,
      })
        .from(roleCourses)
        .where(eq(roleCourses.roleId, roleId)),
      db.select({ featureKey: roleFeatures.featureKey })
        .from(roleFeatures)
        .where(eq(roleFeatures.roleId, roleId)),
    ]);

    // Build nested course tree
    const courseTree = allCourses.map((course) => {
      const courseModules = allModules
        .filter((m) => m.courseId === course.id)
        .map((mod) => ({
          id: mod.id,
          title: mod.title,
          lessons: allLessons
            .filter((l) => l.moduleId === mod.id)
            .map((l) => ({ id: l.id, title: l.title })),
        }));
      return {
        id: course.id,
        title: course.title,
        modules: courseModules,
      };
    });

    return NextResponse.json({
      role,
      courseTree,
      courseGrants: courseGrantRows,
      featureGrants: featureGrantRows.map((r) => r.featureKey),
    });
  } catch (error) {
    console.error("Error fetching role:", error);
    return NextResponse.json(
      { error: "Failed to fetch role" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/roles/:roleId
 * Update a role's name, description, color, or sortOrder.
 * Requires coach role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleId } = await params;
    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const role = await updateRole(roleId, parsed.data);

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({ role });
  } catch (error: unknown) {
    // Handle unique constraint violation (duplicate name)
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 }
      );
    }
    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/roles/:roleId
 * Soft-delete a role. Returns 409 if students are assigned.
 * Requires coach role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleId } = await params;
    const result = await softDeleteRole(roleId);

    if (!result.deleted) {
      return NextResponse.json(
        { error: result.reason },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting role:", error);
    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    );
  }
}
