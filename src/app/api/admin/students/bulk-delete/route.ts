import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { inArray, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * POST /api/admin/students/bulk-delete
 * Soft-delete multiple users in one call (sets users.deletedAt).
 * Skips the current admin user to prevent self-deletion.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Exclude the current admin from the delete set to prevent self-lockout
  const targetIds = parsed.data.userIds.filter((id) => id !== currentUser.id);
  const selfExcluded = parsed.data.userIds.length - targetIds.length;

  if (targetIds.length === 0) {
    return NextResponse.json({
      success: true,
      deletedCount: 0,
      selfExcluded,
    });
  }

  // Fetch clerk IDs so we can lock the accounts too (prevents login)
  const targetRows = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(and(inArray(users.id, targetIds), isNull(users.deletedAt)));

  const deleted = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(and(inArray(users.id, targetIds), isNull(users.deletedAt)))
    .returning({ id: users.id });

  // Lock Clerk accounts so deleted users can't log in. This is fire-and-forget
  // per user — if one lock fails, don't block the rest.
  const clerk = await clerkClient();
  await Promise.allSettled(
    targetRows.map(async (row) => {
      try {
        const clerkUser = await clerk.users.getUser(row.clerkId);
        await clerk.users.updateUserMetadata(row.clerkId, {
          publicMetadata: {
            ...(clerkUser.publicMetadata ?? {}),
            cmbPortalAccessStatus: "expired",
            cmbPortalAccessRevoked: true,
            cmbPortalAccessRevokedAt: new Date().toISOString(),
            cmbPortalAccessRevokedReason: "admin_bulk_delete",
          },
        });
        await clerk.users.lockUser(row.clerkId);
      } catch (err) {
        console.error(
          `[bulk-delete] Failed to lock Clerk user ${row.clerkId}:`,
          err,
        );
      }
    }),
  );

  return NextResponse.json({
    success: true,
    deletedCount: deleted.length,
    selfExcluded,
  });
}
