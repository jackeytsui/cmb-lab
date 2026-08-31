import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { passageReadStatus } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { userCanUseFeature } from "@/lib/feature-access";

/**
 * GET /api/accelerator/reader/progress
 * Fetch all read passage IDs for the current user.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "mandarin_accelerator"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statuses = await db
    .select({ passageId: passageReadStatus.passageId })
    .from(passageReadStatus)
    .where(eq(passageReadStatus.userId, user.id));

  return NextResponse.json({
    readPassageIds: statuses.map((s) => s.passageId),
  });
}

/**
 * POST /api/accelerator/reader/progress
 * Mark a passage as read for the current user (upsert / no-op on re-read).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "mandarin_accelerator"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const schema = z.object({ passageId: z.string().uuid() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db
    .insert(passageReadStatus)
    .values({
      userId: user.id,
      passageId: parsed.data.passageId,
    })
    .onConflictDoNothing();

  return NextResponse.json({ success: true });
}
