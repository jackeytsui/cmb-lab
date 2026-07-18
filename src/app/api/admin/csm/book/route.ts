import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  getBookOfBusiness,
  persistAssessments,
  type CustomerAssessment,
} from "@/lib/csm";
import type { CsmHealthBand } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Compact per-customer shape for the dashboard list. */
function toRow(a: CustomerAssessment) {
  return {
    userId: a.userId,
    name: a.name,
    email: a.email,
    score: a.health.score,
    band: a.health.band,
    trend: a.health.trend,
    churnRisk: a.health.churnRisk,
    summary: a.health.summary,
    lastActivityAt: a.signals.lastActivityAt,
    lessonsCompleted: a.signals.lessonsCompleted,
    lessonsLast30: a.signals.lessonsCompletedLast30,
    onboardingCompleted: a.signals.onboardingCompleted,
    factors: a.health.factors.map((f) => ({
      key: f.key,
      label: f.label,
      score: Math.round(f.score),
      detail: f.detail,
      notApplicable: f.notApplicable ?? false,
    })),
    signals: a.derivedSignals.map((s) => ({
      type: s.type,
      severity: s.severity,
      title: s.title,
      detail: s.detail,
    })),
    actions: a.actions.map((act) => ({
      key: act.key,
      title: act.title,
      description: act.description,
      priority: act.priority,
      reason: act.reason,
    })),
  };
}

function summarize(assessments: CustomerAssessment[]) {
  const bandCounts: Record<CsmHealthBand, number> = {
    thriving: 0,
    healthy: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
  };
  let scoreSum = 0;
  let atRisk = 0;
  let openSignals = 0;
  for (const a of assessments) {
    bandCounts[a.health.band] += 1;
    scoreSum += a.health.score;
    if (a.health.band === "at_risk" || a.health.band === "critical") atRisk += 1;
    openSignals += a.derivedSignals.filter((s) => s.severity !== "info").length;
  }
  const total = assessments.length || 1;
  return {
    totalCustomers: assessments.length,
    avgScore: Math.round(scoreSum / total),
    atRiskCount: atRisk,
    openSignals,
    bandCounts,
  };
}

/**
 * GET /api/admin/csm/book
 * Returns the assessed book of business (health + signals + actions) sorted
 * worst-first, plus portfolio-level summary stats. Read-only — does not persist.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasMinimumRole("coach")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const assessments = await getBookOfBusiness();
    return NextResponse.json({
      summary: summarize(assessments),
      customers: assessments.map(toRow),
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[csm/book] failed:", error);
    return NextResponse.json(
      { error: "Failed to assess book of business" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/csm/book
 * Recomputes health for the whole book and persists a snapshot ledger entry,
 * refreshes the cached account records, and upserts open signals. Admin-only.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasMinimumRole("admin")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const assessments = await getBookOfBusiness();
    const counts = await persistAssessments(assessments);
    return NextResponse.json({
      ok: true,
      ...counts,
      summary: summarize(assessments),
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[csm/book] recompute failed:", error);
    return NextResponse.json(
      { error: "Failed to recompute health scores" },
      { status: 500 },
    );
  }
}
