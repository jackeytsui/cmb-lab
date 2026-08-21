import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { assignBaselineCoachingTagsToStudents } from "@/lib/coaching-access";

function hasActivePortalAccess(metadata: Record<string, unknown>) {
  const status =
    metadata.cmbPortalAccessStatus === "active" ||
    metadata.cmbPortalAccessStatus === "paused" ||
    metadata.cmbPortalAccessStatus === "expired"
      ? metadata.cmbPortalAccessStatus
      : metadata.cmbPortalAccessRevoked === true
        ? "paused"
        : "active";
  const end =
    typeof metadata.cmbCourseEndDate === "string"
      ? new Date(metadata.cmbCourseEndDate)
      : null;
  return (
    status === "active" &&
    (!end || Number.isNaN(end.getTime()) || end.getTime() >= Date.now())
  );
}

/** Idempotent production backfill. It never changes staff, paused, or expired users. */
export async function POST() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(and(eq(users.role, "student"), isNull(users.deletedAt)));
  const clerk = await clerkClient();
  const activeIds: string[] = [];
  const lookupFailures: Array<{ userId: string; error: string }> = [];

  // Small batches avoid overwhelming Clerk while keeping the admin action fast.
  for (let index = 0; index < students.length; index += 20) {
    const batch = students.slice(index, index + 20);
    const results = await Promise.allSettled(
      batch.map(async (student) => {
        const clerkUser = await clerk.users.getUser(student.clerkId);
        if (hasActivePortalAccess(clerkUser.publicMetadata as Record<string, unknown>)) {
          activeIds.push(student.id);
        }
      }),
    );
    results.forEach((result, offset) => {
      if (result.status === "rejected") {
        lookupFailures.push({
          userId: batch[offset].id,
          error: result.reason instanceof Error ? result.reason.message : "Clerk lookup failed",
        });
      }
    });
  }

  const assignment = await assignBaselineCoachingTagsToStudents(activeIds);
  return NextResponse.json({
    studentsChecked: students.length,
    activeStudents: activeIds.length,
    ...assignment,
    lookupFailureCount: lookupFailures.length,
    lookupFailures,
  });
}
