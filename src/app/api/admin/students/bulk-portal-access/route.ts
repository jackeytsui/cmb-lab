import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { setPortalAccess, type PortalAccessStatus } from "@/lib/portal-access";

const bulkSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(["active", "paused", "expired"]),
});

/**
 * POST /api/admin/students/bulk-portal-access
 * Bulk update portal access status for multiple users.
 * Mirrors the single-user PATCH at /api/admin/students/[studentId]/portal-access.
 *
 * Paused/Expired → blocks sign-in until reactivated; records remain visible to staff.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userIds, status } = parsed.data;

  // Look up all clerk IDs in one query
  const userRows = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(inArray(users.id, userIds));

  const clerk = await clerkClient();
  const results: Array<{ userId: string; success: boolean; status?: PortalAccessStatus; error?: string }> = [];
  for (const id of new Set(userIds)) {
    if (!userRows.some((row) => row.id === id)) results.push({ userId: id, success: false, error: "User not found" });
  }

  for (const row of userRows) {
    try {
      if (row.clerkId === userId) {
        throw new Error("Change your own access separately to prevent accidental lockout");
      }
      const updated = await setPortalAccess(clerk, row.clerkId, { status, reason: `admin_bulk_${status}` });
      results.push({ userId: row.id, success: true, status: updated.status });
    } catch (err) {
      results.push({
        userId: row.id,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    status,
    updatedCount: succeeded,
    failedCount: failed,
    results,
  });
}
