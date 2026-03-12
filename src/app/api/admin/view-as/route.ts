import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const COOKIE_NAME = "view_as_user_id";

/**
 * POST /api/admin/view-as
 * Set impersonation: admin views the app as another user.
 * Body: { email: string }
 */
export async function POST(request: Request) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email } = body as { email?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Look up the target user
  const targetUser = await db.query.users.findFirst({
    where: and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)),
    columns: { id: true, email: true, name: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, targetUser.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    },
  });
}

/**
 * DELETE /api/admin/view-as
 * Stop impersonation.
 */
export async function DELETE() {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/admin/view-as
 * Check current impersonation status.
 */
export async function GET() {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const viewAsUserId = cookieStore.get(COOKIE_NAME)?.value;

  if (!viewAsUserId) {
    return NextResponse.json({ active: false });
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, viewAsUserId),
    columns: { id: true, email: true, name: true, role: true },
  });

  if (!targetUser) {
    cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    },
  });
}
