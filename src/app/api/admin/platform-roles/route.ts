import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, platformRoleFeatures } from "@/db/schema";
import { eq, sql, isNull } from "drizzle-orm";

/**
 * GET /api/admin/platform-roles
 * Return all 3 platform roles with their feature lists and user counts.
 * Requires coach role.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Get user counts grouped by role
    const userCounts = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.role);

    const countMap: Record<string, number> = {};
    for (const row of userCounts) {
      countMap[row.role] = row.count;
    }

    // Get all platform role features
    const features = await db
      .select({
        role: platformRoleFeatures.role,
        featureKey: platformRoleFeatures.featureKey,
      })
      .from(platformRoleFeatures);

    const featureMap: Record<string, string[]> = {
      admin: [],
      coach: [],
      student: [],
    };
    for (const row of features) {
      if (featureMap[row.role]) {
        featureMap[row.role].push(row.featureKey);
      }
    }

    const platformRoles = [
      {
        role: "admin",
        label: "Admin",
        description:
          "Full platform access. Manages users, content, and settings.",
        userCount: countMap["admin"] ?? 0,
        features: featureMap["admin"],
      },
      {
        role: "coach",
        label: "Coach",
        description:
          "Manages students and content. Configurable feature access.",
        userCount: countMap["coach"] ?? 0,
        features: featureMap["coach"],
      },
      {
        role: "student",
        label: "Student",
        description:
          "Learns and practices. Feature access based on configuration.",
        userCount: countMap["student"] ?? 0,
        features: featureMap["student"],
      },
    ];

    return NextResponse.json({ platformRoles });
  } catch (error) {
    console.error("Error fetching platform roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform roles" },
      { status: 500 }
    );
  }
}
