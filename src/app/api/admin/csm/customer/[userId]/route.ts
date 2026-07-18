import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  customerHealthScores,
  csmActivities,
  csmSignals,
  csmAccounts,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { loadCustomerSignals, assessCustomer } from "@/lib/csm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/csm/customer/[userId]
 * Customer 360: live assessment + health history + signal history + timeline.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: authUserId } = await auth();
  if (!authUserId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasMinimumRole("coach")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  try {
    const [user, signals, account] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, name: true, email: true, createdAt: true },
      }),
      loadCustomerSignals(userId),
      db.query.csmAccounts.findFirst({ where: eq(csmAccounts.userId, userId) }),
    ]);

    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const assessment = signals
      ? assessCustomer(signals, account?.healthScore ?? null)
      : null;

    const [history, signalHistory, timeline] = await Promise.all([
      db
        .select({
          score: customerHealthScores.score,
          band: customerHealthScores.band,
          computedAt: customerHealthScores.computedAt,
        })
        .from(customerHealthScores)
        .where(eq(customerHealthScores.userId, userId))
        .orderBy(desc(customerHealthScores.computedAt))
        .limit(30),
      db
        .select()
        .from(csmSignals)
        .where(eq(csmSignals.userId, userId))
        .orderBy(desc(csmSignals.detectedAt))
        .limit(20),
      db
        .select()
        .from(csmActivities)
        .where(eq(csmActivities.userId, userId))
        .orderBy(desc(csmActivities.occurredAt))
        .limit(30),
    ]);

    return NextResponse.json({
      user,
      account: account ?? null,
      assessment: assessment
        ? {
            health: assessment.health,
            signals: assessment.derivedSignals,
            actions: assessment.actions,
          }
        : null,
      history,
      signalHistory,
      timeline,
    });
  } catch (error) {
    console.error("[csm/customer] failed:", error);
    return NextResponse.json({ error: "Failed to load customer" }, { status: 500 });
  }
}
