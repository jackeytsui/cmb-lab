import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  csmAccounts,
  customerHealthScores,
  csmSignals,
} from "@/db/schema";
import { loadAllCustomerSignals, scoreHealth } from "./health";
import { deriveSignals } from "./signals";
import { recommendNextBestActions } from "./playbooks";
import type {
  CustomerSignals,
  DerivedSignal,
  HealthResult,
  NextBestAction,
} from "./types";

export * from "./types";
export {
  scoreHealth,
  bandForScore,
  loadAllCustomerSignals,
  loadCustomerSignals,
} from "./health";
export { deriveSignals } from "./signals";
export { recommendNextBestActions, DEFAULT_PLAYBOOKS } from "./playbooks";

/** A fully-assessed customer: health + signals + recommended actions. */
export interface CustomerAssessment {
  userId: string;
  name: string | null;
  email: string | null;
  signals: CustomerSignals;
  health: HealthResult;
  derivedSignals: DerivedSignal[];
  actions: NextBestAction[];
}

/** Pure combine: score → derive signals → recommend actions. */
export function assessCustomer(
  signals: CustomerSignals,
  previousScore: number | null,
): {
  health: HealthResult;
  derivedSignals: DerivedSignal[];
  actions: NextBestAction[];
} {
  const health = scoreHealth(signals, previousScore);
  const derivedSignals = deriveSignals(signals, health);
  const actions = recommendNextBestActions(signals, health, derivedSignals);
  return { health, derivedSignals, actions };
}

/**
 * Assess the entire book of business in one pass. Reads previous scores from
 * the cached csm_accounts.healthScore so trend is computed without a heavy
 * per-user history query.
 */
export async function getBookOfBusiness(): Promise<CustomerAssessment[]> {
  const signalMap = await loadAllCustomerSignals();
  const ids = [...signalMap.keys()];
  if (ids.length === 0) return [];

  // Display names + previous cached scores.
  const [roster, accounts] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "student"), isNull(users.deletedAt))),
    db
      .select({
        userId: csmAccounts.userId,
        healthScore: csmAccounts.healthScore,
      })
      .from(csmAccounts),
  ]);

  const nameById = new Map(roster.map((r) => [r.id, r]));
  const prevScoreById = new Map(
    accounts.map((a) => [a.userId, a.healthScore ?? null]),
  );

  const result: CustomerAssessment[] = [];
  for (const [userId, signals] of signalMap) {
    const previousScore = prevScoreById.get(userId) ?? null;
    const { health, derivedSignals, actions } = assessCustomer(
      signals,
      previousScore,
    );
    const info = nameById.get(userId);
    result.push({
      userId,
      name: info?.name ?? null,
      email: info?.email ?? null,
      signals,
      health,
      derivedSignals,
      actions,
    });
  }

  // Sort worst health first — the triage order for the CSM worklist.
  result.sort((a, b) => a.health.score - b.health.score);
  return result;
}

/**
 * Persist a recompute: snapshot every health score, refresh the cached account
 * record, and upsert open signals (deduped by stable key). Returns counts.
 */
export async function persistAssessments(
  assessments: CustomerAssessment[],
): Promise<{ accounts: number; scores: number; signals: number }> {
  let accountsWritten = 0;
  let scoresWritten = 0;
  let signalsWritten = 0;

  for (const a of assessments) {
    const now = new Date();
    // Upsert the account anchor with the freshly-computed cached fields.
    const [account] = await db
      .insert(csmAccounts)
      .values({
        userId: a.userId,
        healthScore: a.health.score,
        healthBand: a.health.band,
        healthTrend: a.health.trend,
        churnRisk: a.health.churnRisk,
        lastActivityAt: a.signals.lastActivityAt ?? null,
        productLine: null,
        renewalDate: a.signals.productEndDate ?? null,
        healthComputedAt: now,
        onboardedAt: a.signals.onboardingCompleted
          ? (a.signals.createdAt ?? null)
          : null,
      })
      .onConflictDoUpdate({
        target: csmAccounts.userId,
        set: {
          healthScore: a.health.score,
          healthBand: a.health.band,
          healthTrend: a.health.trend,
          churnRisk: a.health.churnRisk,
          lastActivityAt: a.signals.lastActivityAt ?? null,
          renewalDate: a.signals.productEndDate ?? null,
          healthComputedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: csmAccounts.id });
    accountsWritten += 1;

    // Append an immutable health snapshot to the ledger.
    const factorsRecord: Record<
      string,
      { score: number; weight: number; weighted: number; detail?: string }
    > = {};
    for (const f of a.health.factors) {
      factorsRecord[f.key] = {
        score: Math.round(f.score),
        weight: Number(f.weight.toFixed(3)),
        weighted: Number(f.weighted.toFixed(2)),
        detail: f.detail,
      };
    }
    await db.insert(customerHealthScores).values({
      userId: a.userId,
      accountId: account?.id ?? null,
      score: a.health.score,
      band: a.health.band,
      trend: a.health.trend,
      churnRisk: a.health.churnRisk,
      previousScore: a.health.previousScore,
      factors: factorsRecord,
      summary: a.health.summary,
    });
    scoresWritten += 1;

    // Upsert derived signals, deduped by stable key.
    for (const sig of a.derivedSignals) {
      await db
        .insert(csmSignals)
        .values({
          userId: a.userId,
          accountId: account?.id ?? null,
          type: sig.type,
          severity: sig.severity,
          status: "open",
          title: sig.title,
          detail: sig.detail,
          dedupeKey: sig.dedupeKey,
          data: sig.data,
        })
        .onConflictDoUpdate({
          target: csmSignals.dedupeKey,
          set: {
            severity: sig.severity,
            title: sig.title,
            detail: sig.detail,
            data: sig.data,
            updatedAt: new Date(),
          },
        });
      signalsWritten += 1;
    }
  }

  return {
    accounts: accountsWritten,
    scores: scoresWritten,
    signals: signalsWritten,
  };
}

/**
 * Resolve any open signals for a user whose condition no longer holds. Called
 * after a recompute so the worklist doesn't accumulate stale risk.
 */
export async function resolveStaleSignals(
  userId: string,
  stillActiveDedupeKeys: string[],
): Promise<void> {
  const open = await db
    .select({ id: csmSignals.id, dedupeKey: csmSignals.dedupeKey })
    .from(csmSignals)
    .where(and(eq(csmSignals.userId, userId), eq(csmSignals.status, "open")));

  const toResolve = open
    .filter((s) => s.dedupeKey && !stillActiveDedupeKeys.includes(s.dedupeKey))
    .map((s) => s.id);

  if (toResolve.length > 0) {
    await db
      .update(csmSignals)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(inArray(csmSignals.id, toResolve));
  }
}
