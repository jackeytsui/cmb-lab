import { NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { getRoles, createRole } from "@/lib/roles";
import type { Role } from "@/db/schema";

const ROLE_TEMPLATES = [
  { name: "Bronze", color: "#cd7f32" },
  { name: "Silver", color: "#c0c0c0" },
  { name: "Gold", color: "#ffd700" },
];

/**
 * POST /api/admin/roles/templates
 * Seed preset role templates (Bronze, Silver, Gold).
 * Skips any that already exist (idempotent).
 * Requires admin role.
 */
export async function POST() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const currentUser = await getCurrentUser();
    const existingRoles = await getRoles();
    const existingNames = new Set(existingRoles.map((r) => r.name));

    const created: Role[] = [];
    let skipped = 0;

    for (const template of ROLE_TEMPLATES) {
      if (existingNames.has(template.name)) {
        skipped++;
        continue;
      }

      const role = await createRole({
        name: template.name,
        color: template.color,
        createdBy: currentUser?.id,
      });
      created.push(role);
    }

    return NextResponse.json({ created, skipped });
  } catch (error) {
    console.error("Error seeding role templates:", error);
    return NextResponse.json(
      { error: "Failed to seed role templates" },
      { status: 500 }
    );
  }
}
