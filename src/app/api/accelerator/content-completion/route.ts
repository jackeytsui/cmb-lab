import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, acceleratorContentCompletion } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const VALID_KEYS = ["practice_plan", "starter_pack"];

async function getDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

/**
 * GET /api/accelerator/content-completion?key=practice_plan
 * Check if the current user completed a content page.
 * If no key param, returns all completed keys for the user.
 */
export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");

  if (key) {
    const row = await db.query.acceleratorContentCompletion.findFirst({
      where: and(
        eq(acceleratorContentCompletion.userId, user.id),
        eq(acceleratorContentCompletion.contentKey, key)
      ),
    });
    return NextResponse.json({ completed: !!row });
  }

  const rows = await db
    .select({ contentKey: acceleratorContentCompletion.contentKey })
    .from(acceleratorContentCompletion)
    .where(eq(acceleratorContentCompletion.userId, user.id));

  return NextResponse.json({
    completed: rows.map((r) => r.contentKey),
  });
}

/**
 * POST /api/accelerator/content-completion
 * Body: { key: "practice_plan" | "starter_pack" }
 * Mark a content page as completed.
 */
export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = (await req.json()) as { key?: string };
  if (!key || !VALID_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await db
    .insert(acceleratorContentCompletion)
    .values({ userId: user.id, contentKey: key })
    .onConflictDoNothing();

  return NextResponse.json({ completed: true });
}

/**
 * DELETE /api/accelerator/content-completion
 * Body: { key: "practice_plan" | "starter_pack" }
 * Unmark a content page.
 */
export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = (await req.json()) as { key?: string };
  if (!key || !VALID_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await db
    .delete(acceleratorContentCompletion)
    .where(
      and(
        eq(acceleratorContentCompletion.userId, user.id),
        eq(acceleratorContentCompletion.contentKey, key)
      )
    );

  return NextResponse.json({ completed: false });
}
