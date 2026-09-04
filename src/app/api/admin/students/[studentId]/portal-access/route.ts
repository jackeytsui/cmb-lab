import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeCourseEndDate, portalAccessStatus, setPortalAccess } from "@/lib/portal-access";

const statusSchema = z.enum(["active", "paused", "expired"]);

const patchSchema = z.object({
  status: statusSchema,
  courseEndDate: z.string().nullable().optional(), // YYYY-MM-DD or null
});

interface RouteParams {
  params: Promise<{ studentId: string }>;
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
  const status = portalAccessStatus(metadata);
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

  try {
    if (parsed.data.courseEndDate !== undefined) normalizeCourseEndDate(parsed.data.courseEndDate);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  if (dbUser.clerkId === userId) {
    return NextResponse.json({ error: "Ask another admin to change your access to prevent accidental lockout" }, { status: 409 });
  }
  try {
    const result = await setPortalAccess(await clerkClient(), dbUser.clerkId, {
      ...parsed.data,
      reason: `admin_manual_${parsed.data.status}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to update portal access:", error);
    return NextResponse.json({ error: "Access update could not be completed. Please retry or review the account's security status." }, { status: 502 });
  }
}
