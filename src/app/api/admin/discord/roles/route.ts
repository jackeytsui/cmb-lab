// GET /api/admin/discord/roles
// Lists the Discord guild's roles for the mapping dropdown. Requires admin.

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { isDiscordConfigured, listGuildRoles } from "@/lib/discord/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isDiscordConfigured()) {
    return NextResponse.json({ roles: [], configured: false });
  }

  try {
    const roles = await listGuildRoles();
    // Exclude @everyone (id === guild id shows as position 0 name "@everyone")
    // and integration-managed roles (bot roles) which cannot be assigned.
    const assignable = roles
      .filter((r) => r.name !== "@everyone" && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    return NextResponse.json({ roles: assignable, configured: true });
  } catch (error) {
    console.error("Error listing Discord roles:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list roles" },
      { status: 500 }
    );
  }
}
