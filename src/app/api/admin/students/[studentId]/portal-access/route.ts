import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const statusSchema = z.enum(["active", "paused", "expired"]);

const patchSchema = z.object({
  status: statusSchema,
  courseEndDate: z.string().nullable().optional(), // YYYY-MM-DD or null
});

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

function normalizeCourseEndDate(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { studentId } = await params;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, studentId),
    columns: { clerkId: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(dbUser.clerkId);
  const metadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
  const rawStatus =
    typeof metadata.cmbPortalAccessStatus === "string"
      ? metadata.cmbPortalAccessStatus
      : metadata.cmbPortalAccessRevoked === true
        ? "paused"
        : "active";
  const status = statusSchema.safeParse(rawStatus).success ? rawStatus : "active";
  const courseEndDate =
    typeof metadata.cmbCourseEndDate === "string"
      ? metadata.cmbCourseEndDate.slice(0, 10)
      : null;

  return NextResponse.json({ status, courseEndDate });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { studentId } = await params;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, studentId),
    columns: { clerkId: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedCourseEnd = normalizeCourseEndDate(parsed.data.courseEndDate);
  const now = new Date();
  const computedStatus =
    normalizedCourseEnd && new Date(normalizedCourseEnd).getTime() < now.getTime()
      ? "expired"
      : parsed.data.status;

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(dbUser.clerkId);
  await clerk.users.updateUserMetadata(dbUser.clerkId, {
    publicMetadata: {
      ...(clerkUser.publicMetadata ?? {}),
      cmbPortalAccessStatus: computedStatus,
      cmbCourseEndDate: normalizedCourseEnd,
      cmbPortalAccessRevoked: computedStatus !== "active",
      cmbPortalAccessRevokedAt:
        computedStatus === "active" ? null : new Date().toISOString(),
      cmbPortalAccessRevokedReason:
        computedStatus === "active"
          ? null
          : computedStatus === "expired"
            ? "course_end_date_expired"
            : "admin_manual_pause",
    },
  });

  if (computedStatus === "active") {
    try {
      await clerk.users.unlockUser(dbUser.clerkId);
    } catch {
      // No-op if unlocked already.
    }
  } else {
    try {
      await clerk.users.lockUser(dbUser.clerkId);
    } catch {
      // No-op if locked already.
    }
  }

  return NextResponse.json({
    status: computedStatus,
    courseEndDate: normalizedCourseEnd ? normalizedCourseEnd.slice(0, 10) : null,
  });
}
