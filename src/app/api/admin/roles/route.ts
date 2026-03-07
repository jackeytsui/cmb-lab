import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { getRoles, createRole } from "@/lib/roles";
import { z } from "zod";

const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(100, "Role name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color"),
});

/**
 * GET /api/admin/roles
 * List all non-deleted roles with student counts.
 * Accepts optional ?search= query param.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;

    const allRoles = await getRoles(search ? { search } : undefined);
    return NextResponse.json({ roles: allRoles });
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/roles
 * Create a new role.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    const role = await createRole({
      ...parsed.data,
      createdBy: currentUser?.id,
    });

    return NextResponse.json({ role }, { status: 201 });
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
    console.error("Error creating role:", error);
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 }
    );
  }
}
