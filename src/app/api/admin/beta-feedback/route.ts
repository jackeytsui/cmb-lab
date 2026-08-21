import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { betaFeedback, users } from "@/db/schema";
import { getRealUser, hasMinimumRole } from "@/lib/auth";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z
    .enum(["new", "reviewing", "planned", "resolved", "closed"])
    .optional(),
  adminNote: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const statusFilter = ["new", "reviewing", "planned", "resolved", "closed"].includes(
    status ?? "",
  )
    ? (status as "new" | "reviewing" | "planned" | "resolved" | "closed")
    : null;

  const [items, counts] = await Promise.all([
    db
      .select({
        id: betaFeedback.id,
        category: betaFeedback.category,
        message: betaFeedback.message,
        pagePath: betaFeedback.pagePath,
        source: betaFeedback.source,
        status: betaFeedback.status,
        adminNote: betaFeedback.adminNote,
        createdAt: betaFeedback.createdAt,
        updatedAt: betaFeedback.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(betaFeedback)
      .innerJoin(users, eq(betaFeedback.userId, users.id))
      .where(statusFilter ? eq(betaFeedback.status, statusFilter) : undefined)
      .orderBy(desc(betaFeedback.createdAt))
      .limit(100),
    db
      .select({
        status: betaFeedback.status,
        count: sql<number>`count(*)::int`,
      })
      .from(betaFeedback)
      .groupBy(betaFeedback.status),
  ]);

  return NextResponse.json({ items, counts });
}

export async function PATCH(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const reviewer = await getRealUser();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.status && parsed.data.adminNote === undefined)) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const [updated] = await db
    .update(betaFeedback)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.adminNote !== undefined
        ? { adminNote: parsed.data.adminNote || null }
        : {}),
      reviewedBy: reviewer.id,
      updatedAt: new Date(),
    })
    .where(eq(betaFeedback.id, parsed.data.id))
    .returning({ id: betaFeedback.id });

  if (!updated) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
