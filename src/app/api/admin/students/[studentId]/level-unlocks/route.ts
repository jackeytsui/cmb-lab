// Admin API: per-student early-unlock grants for gated course levels
// (Intermediate/Advanced). Grants/revokes are mirrored to GoHighLevel as
// contact tags ("CMB Level Unlocked: …") by lib/course-level-access.ts, so
// the team sees the same unlock state in GHL.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  grantLevelUnlock,
  listLevelUnlocks,
  revokeLevelUnlock,
} from "@/lib/course-level-access";

const levelSchema = z.enum(["intermediate", "advanced"]);

const grantSchema = z.object({
  level: levelSchema,
  note: z.string().max(500).optional(),
});

const revokeSchema = z.object({
  level: levelSchema,
});

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

async function requireAdminAndStudent(studentId: string) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const student = await db.query.users.findFirst({
    where: eq(users.id, studentId),
    columns: { id: true },
  });
  if (!student) {
    return {
      error: NextResponse.json({ error: "Student not found" }, { status: 404 }),
    };
  }
  return { error: null };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { studentId } = await params;
  const { error } = await requireAdminAndStudent(studentId);
  if (error) return error;

  const unlocks = await listLevelUnlocks(studentId);
  return NextResponse.json({ unlocks });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { studentId } = await params;
  const { error } = await requireAdminAndStudent(studentId);
  if (error) return error;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { created } = await grantLevelUnlock({
    userId: studentId,
    level: parsed.data.level,
    source: "team",
    grantedBy: currentUser.id,
    note: parsed.data.note ?? null,
  });

  const unlocks = await listLevelUnlocks(studentId);
  return NextResponse.json({ created, unlocks });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { studentId } = await params;
  const { error } = await requireAdminAndStudent(studentId);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { removed } = await revokeLevelUnlock(studentId, parsed.data.level);
  const unlocks = await listLevelUnlocks(studentId);
  return NextResponse.json({ removed, unlocks });
}
