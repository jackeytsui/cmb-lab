import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { getUserRoles, assignRole, removeRole } from "@/lib/user-roles";

interface RouteContext {
  params: Promise<{ studentId: string }>;
}

/**
 * GET /api/admin/students/[studentId]/roles
 * Returns assigned roles and available (unassigned) roles for the student.
 * Requires coach+ role.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await context.params;

  try {
    // Get assigned roles for this student
    const assigned = await getUserRoles(studentId);

    // Get all non-deleted roles, then filter out already-assigned ones
    const allRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
        color: roles.color,
        description: roles.description,
      })
      .from(roles)
      .where(isNull(roles.deletedAt));

    const assignedRoleIds = new Set(assigned.map((r) => r.roleId));
    const availableRoles = allRoles.filter((r) => !assignedRoleIds.has(r.id));

    return NextResponse.json({ roles: assigned, availableRoles });
  } catch (error) {
    console.error("Error fetching student roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}

const assignSchema = z.object({
  roleId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * POST /api/admin/students/[studentId]/roles
 * Assign a role to a student with optional expiration date.
 * Requires coach+ role.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { studentId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Convert expiresAt to end-of-day UTC to avoid timezone confusion (Pitfall 4)
    let expiresAtDate: Date | undefined;
    if (parsed.data.expiresAt) {
      expiresAtDate = new Date(parsed.data.expiresAt);
      expiresAtDate.setUTCHours(23, 59, 59, 999);
    }

    await assignRole(
      studentId,
      parsed.data.roleId,
      currentUser.id,
      expiresAtDate
    );

    // Re-fetch the assignment with role details for the response
    const assigned = await getUserRoles(studentId);
    const assignment = assigned.find((r) => r.roleId === parsed.data.roleId);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error("Error assigning role:", error);
    return NextResponse.json(
      { error: "Failed to assign role" },
      { status: 500 }
    );
  }
}

const removeSchema = z.object({
  roleId: z.string().uuid(),
});

/**
 * DELETE /api/admin/students/[studentId]/roles
 * Remove a role from a student.
 * Requires coach+ role.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const removed = await removeRole(studentId, parsed.data.roleId);

    if (!removed) {
      return NextResponse.json(
        { error: "Role assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing role:", error);
    return NextResponse.json(
      { error: "Failed to remove role" },
      { status: 500 }
    );
  }
}
