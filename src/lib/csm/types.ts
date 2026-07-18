import type {
  CsmHealthBand,
  CsmTrend,
  CsmSignalType,
  CsmSignalSeverity,
} from "@/db/schema";

/**
 * The raw, source-agnostic signal bundle for one customer at one point in time.
 *
 * This is intentionally a plain data struct so the scoring engine is a pure
 * function of its inputs — trivially testable, deterministic, and reusable for
 * students, B2B seats, or partner businesses. Loaders (health.ts) populate it
 * from the LMS + CRM; the scorer never touches the database.
 */
export interface CustomerSignals {
  userId: string;
  now: Date;
  /** When the customer relationship began (enrollment / account creation). */
  createdAt: Date | null;
  /** Most recent meaningful activity across all product surfaces. */
  lastActivityAt: Date | null;
  /** Lifetime lessons completed. */
  lessonsCompleted: number;
  /** Lessons completed in the trailing 30 days (velocity numerator). */
  lessonsCompletedLast30: number;
  /** Lessons completed in the 30 days before that (velocity baseline). */
  lessonsCompletedPrev30: number;
  /** Distinct active days in the trailing 14 days (consistency). */
  activeDaysLast14: number;
  /** All-time longest streak (habit strength). */
  longestStreak: number;
  /** Current active streak in days. */
  currentStreak: number;
  /** Whether the customer has completed their first lesson (onboarding). */
  onboardingCompleted: boolean;
  /** Whether a coach/CSM owns this relationship. */
  hasAssignedCoach: boolean;
  /** Most recent coaching touchpoint, if any. */
  lastCoachingAt: Date | null;
  /** Average coaching-session rating the student gave (1-5), if any. */
  avgCoachingRating: number | null;
  /** Latest CSAT/service-quality rating on a 1-5 scale, if any. */
  satisfactionRating: number | null;
  /** Billing status: 'paid' | 'active' | 'failed' | 'overdue' | 'trialing' | null. */
  paymentStatus: string | null;
  /** When the current product/plan lapses (renewal horizon). */
  productEndDate: Date | null;
}

/** One explainable contributor to the composite score. */
export interface HealthFactor {
  key: string;
  label: string;
  /** 0-100 subscore for this dimension. */
  score: number;
  /** Effective weight after redistributing any not-applicable factors. */
  weight: number;
  /** score * weight — the contribution to the composite. */
  weighted: number;
  /** Human-readable one-liner explaining the subscore. */
  detail: string;
  /** True when the factor could not be measured and was excluded. */
  notApplicable?: boolean;
}

/** The full result of scoring one customer. */
export interface HealthResult {
  score: number; // 0-100 composite
  band: CsmHealthBand;
  trend: CsmTrend;
  churnRisk: number; // 0-100 (higher = more likely to churn)
  previousScore: number | null;
  factors: HealthFactor[];
  summary: string;
}

/** A derived risk/opportunity signal, ready to upsert into csm_signals. */
export interface DerivedSignal {
  type: CsmSignalType;
  severity: CsmSignalSeverity;
  title: string;
  detail: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}

/** A recommended next-best-action, ready to become a csm_task. */
export interface NextBestAction {
  key: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  /** Which signal type motivated this action. */
  reason: CsmSignalType | "health";
}
