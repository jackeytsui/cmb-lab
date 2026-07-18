import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ============================================================
// Customer Success Management (CSM) schema
//
// Adds a unified customer-success layer on top of the LMS. The LMS already
// tracks rich behavioural signals (lesson progress, engagement events, XP,
// streaks, coaching sessions, GHL CRM data). This schema turns those signals
// into a managed customer-success workflow: a health score per customer, a
// lifecycle stage, risk signals, playbooks, a prioritised worklist, and a
// touchpoint timeline.
//
// Design goals:
//   - Multi-tenant ready: every row is scoped by userId (the customer) and an
//     optional accountId so the same engine can serve students, B2B seats, or
//     whole partner businesses without a schema change.
//   - Append-only where trend matters (health scores, activities) so history
//     is never lost and churn models have training data.
//   - Config-as-data: playbooks are rows, not code, so success ops can author
//     new automations without a deploy.
// ============================================================

// ------------------------------------------------------------
// Enums
// ------------------------------------------------------------

// Lifecycle stage of a customer relationship. Mirrors the canonical CS journey
// (onboarding -> adopting -> established -> at risk -> renewal/expansion ->
// churned) so playbooks and reporting can segment on stage.
export const csmLifecycleStageEnum = pgEnum("csm_lifecycle_stage", [
  "onboarding",
  "adopting",
  "established",
  "at_risk",
  "renewal",
  "expansion",
  "churned",
  "reactivated",
]);

// Health band derived from the numeric health score. Kept as a stored enum
// (not just computed) so we can index/filter the book of business quickly.
export const csmHealthBandEnum = pgEnum("csm_health_band", [
  "thriving", // 80-100
  "healthy", // 60-79
  "watch", // 40-59
  "at_risk", // 20-39
  "critical", // 0-19
]);

// Direction of the health trend vs the previous snapshot.
export const csmTrendEnum = pgEnum("csm_trend", [
  "improving",
  "steady",
  "declining",
]);

// Categories of risk / opportunity signals the engine can detect.
export const csmSignalTypeEnum = pgEnum("csm_signal_type", [
  "inactivity", // no meaningful activity in N days
  "stalled_progress", // enrolled but lesson velocity dropped to ~0
  "onboarding_stall", // never completed first lesson within window
  "low_satisfaction", // survey/NPS/coaching rating below threshold
  "coaching_gap", // assigned a coach but no session in cadence window
  "streak_broken", // lost a meaningful streak
  "payment_risk", // failed/overdue payment or plan lapsing
  "renewal_upcoming", // product end date approaching
  "expansion_signal", // high engagement + upsell eligibility
  "milestone_reached", // completed a module/level (celebration/advocacy)
  "champion", // power user (advocacy / testimonial / referral)
]);

export const csmSignalSeverityEnum = pgEnum("csm_signal_severity", [
  "info", // positive / neutral (milestones, champions, expansion)
  "low",
  "medium",
  "high",
  "critical",
]);

export const csmSignalStatusEnum = pgEnum("csm_signal_status", [
  "open",
  "acknowledged",
  "resolved",
  "dismissed",
  "expired",
]);

// How a playbook gets triggered.
export const csmPlaybookTriggerEnum = pgEnum("csm_playbook_trigger", [
  "signal", // fires when a matching signal type appears
  "lifecycle_stage", // fires on entering a lifecycle stage
  "health_band", // fires on crossing into a health band
  "manual", // CSM enrolls a customer by hand
  "schedule", // time-based (e.g. day 3 of onboarding)
]);

export const csmPlaybookRunStatusEnum = pgEnum("csm_playbook_run_status", [
  "active",
  "completed",
  "cancelled",
  "failed",
]);

export const csmTaskStatusEnum = pgEnum("csm_task_status", [
  "open",
  "in_progress",
  "done",
  "snoozed",
  "dismissed",
]);

export const csmTaskPriorityEnum = pgEnum("csm_task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

// Types of touchpoints logged on the customer timeline.
export const csmActivityTypeEnum = pgEnum("csm_activity_type", [
  "note",
  "email",
  "call",
  "meeting",
  "coaching_session",
  "loom",
  "in_app_message",
  "survey_response",
  "system", // engine-generated (score change, stage change, playbook run)
]);

// ------------------------------------------------------------
// csm_accounts — the customer-success anchor record (one per customer).
//
// This is the "Customer 360" root. It caches the latest health/lifecycle so
// the book-of-business list renders in one query, and it holds ownership
// (which CSM/coach owns the relationship). accountRef lets several LMS users
// roll up into one commercial account (a family, a school, a B2B seat block).
// ------------------------------------------------------------
export const csmAccounts = pgTable(
  "csm_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional grouping key for B2B / multi-seat rollups. Free text so it can
    // hold a GHL company id, a school name, or a cohort id without new tables.
    accountRef: text("account_ref"),
    accountName: text("account_name"),
    // The CSM/coach who owns this relationship.
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lifecycleStage: csmLifecycleStageEnum("lifecycle_stage")
      .notNull()
      .default("onboarding"),
    // Cached latest health snapshot (source of truth is customer_health_scores).
    healthScore: integer("health_score"),
    healthBand: csmHealthBandEnum("health_band"),
    healthTrend: csmTrendEnum("health_trend"),
    // 0-100 probability-of-churn style risk (higher = more likely to churn).
    churnRisk: integer("churn_risk"),
    // Denormalised commercial context (mirrored from GHL / billing).
    productLine: text("product_line"),
    mrrCents: integer("mrr_cents"), // monthly recurring value in cents
    renewalDate: timestamp("renewal_date", { withTimezone: true }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    healthComputedAt: timestamp("health_computed_at", { withTimezone: true }),
    // Free-form CSM tags (goals, segment, risk reasons) as an array of strings.
    tags: jsonb("tags").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("csm_accounts_user_unique").on(table.userId),
    index("csm_accounts_owner_idx").on(table.ownerId),
    index("csm_accounts_stage_idx").on(table.lifecycleStage),
    index("csm_accounts_band_idx").on(table.healthBand),
    index("csm_accounts_account_ref_idx").on(table.accountRef),
    index("csm_accounts_churn_idx").on(table.churnRisk),
  ],
);

// ------------------------------------------------------------
// customer_health_scores — append-only snapshot ledger.
//
// Every recompute writes a new row so we can chart health over time, measure
// the effect of interventions, and eventually train a churn model. The factor
// breakdown is stored so the score is always explainable ("why is this red?").
// ------------------------------------------------------------
export const customerHealthScores = pgTable(
  "customer_health_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => csmAccounts.id, {
      onDelete: "cascade",
    }),
    score: integer("score").notNull(), // 0-100 composite
    band: csmHealthBandEnum("band").notNull(),
    trend: csmTrendEnum("trend").notNull().default("steady"),
    churnRisk: integer("churn_risk").notNull().default(0), // 0-100
    previousScore: integer("previous_score"),
    // Per-factor breakdown: { factor: { score, weight, weighted, detail } }.
    // Stored so the UI can render an explainable "health contributors" panel.
    factors: jsonb("factors")
      .$type<
        Record<
          string,
          { score: number; weight: number; weighted: number; detail?: string }
        >
      >()
      .notNull()
      .default({}),
    // Human-readable one-line narrative ("Engagement dropped 60% this week").
    summary: text("summary"),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    index("customer_health_scores_user_idx").on(table.userId),
    index("customer_health_scores_user_computed_idx").on(
      table.userId,
      table.computedAt,
    ),
    index("customer_health_scores_band_idx").on(table.band),
  ],
);

// ------------------------------------------------------------
// csm_signals — detected risk / opportunity events.
//
// The signal engine writes these; playbooks and the worklist consume them.
// dedupeKey lets the engine upsert (re-open or refresh) instead of spamming a
// new row every run for the same ongoing condition.
// ------------------------------------------------------------
export const csmSignals = pgTable(
  "csm_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => csmAccounts.id, {
      onDelete: "cascade",
    }),
    type: csmSignalTypeEnum("type").notNull(),
    severity: csmSignalSeverityEnum("severity").notNull().default("medium"),
    status: csmSignalStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    detail: text("detail"),
    // Stable key for upsert dedupe, e.g. `inactivity:<userId>`.
    dedupeKey: text("dedupe_key"),
    // Numeric context that produced the signal (days inactive, score, etc.).
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("csm_signals_user_idx").on(table.userId),
    index("csm_signals_status_idx").on(table.status),
    index("csm_signals_type_idx").on(table.type),
    index("csm_signals_severity_idx").on(table.severity),
    uniqueIndex("csm_signals_dedupe_unique").on(table.dedupeKey),
  ],
);

// ------------------------------------------------------------
// csm_playbooks — config-as-data automation definitions.
//
// A playbook = a trigger + a set of steps. Steps are stored as JSON so success
// ops can author "when inactivity>=14d, create urgent task + send re-engage
// email + notify owner" without shipping code.
// ------------------------------------------------------------
export const csmPlaybooks = pgTable(
  "csm_playbooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    trigger: csmPlaybookTriggerEnum("trigger").notNull(),
    // Trigger matcher: which signal type / stage / band this listens for, plus
    // thresholds, e.g. { signalType: "inactivity", minSeverity: "high" }.
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Ordered steps, e.g.
    //   [{ type: "create_task", ... }, { type: "send_email", template: "..." }]
    steps: jsonb("steps")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    isActive: boolean("is_active").notNull().default(true),
    // Optional stage transition applied when the playbook completes.
    setLifecycleStage: csmLifecycleStageEnum("set_lifecycle_stage"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("csm_playbooks_trigger_idx").on(table.trigger),
    index("csm_playbooks_active_idx").on(table.isActive),
  ],
);

// ------------------------------------------------------------
// csm_playbook_runs — an enrollment of one customer into one playbook.
//
// enrollKey dedupes so the same customer isn't enrolled twice for the same
// ongoing condition. currentStep tracks progress through the step list.
// ------------------------------------------------------------
export const csmPlaybookRuns = pgTable(
  "csm_playbook_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => csmPlaybooks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => csmAccounts.id, {
      onDelete: "cascade",
    }),
    signalId: uuid("signal_id").references(() => csmSignals.id, {
      onDelete: "set null",
    }),
    status: csmPlaybookRunStatusEnum("status").notNull().default("active"),
    currentStep: integer("current_step").notNull().default(0),
    enrollKey: text("enroll_key"),
    log: jsonb("log")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("csm_playbook_runs_user_idx").on(table.userId),
    index("csm_playbook_runs_playbook_idx").on(table.playbookId),
    index("csm_playbook_runs_status_idx").on(table.status),
    uniqueIndex("csm_playbook_runs_enroll_unique").on(table.enrollKey),
  ],
);

// ------------------------------------------------------------
// csm_tasks — the CSM worklist. The prioritised "what should I do next" queue.
//
// Tasks can be engine-generated (from a playbook/signal) or created by hand.
// assignedTo = the CSM who should act; userId = the customer it concerns.
// ------------------------------------------------------------
export const csmTasks = pgTable(
  "csm_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => csmAccounts.id, {
      onDelete: "cascade",
    }),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: csmTaskStatusEnum("status").notNull().default("open"),
    priority: csmTaskPriorityEnum("priority").notNull().default("medium"),
    // Suggested next-best-action key (e.g. "send_reengagement_email") so the UI
    // can offer a one-click action.
    suggestedAction: text("suggested_action"),
    dueAt: timestamp("due_at"),
    snoozedUntil: timestamp("snoozed_until"),
    // Provenance: which signal / playbook generated it (null = manual).
    signalId: uuid("signal_id").references(() => csmSignals.id, {
      onDelete: "set null",
    }),
    playbookRunId: uuid("playbook_run_id").references(() => csmPlaybookRuns.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("manual"), // manual | signal | playbook
    completedAt: timestamp("completed_at"),
    completedBy: uuid("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("csm_tasks_user_idx").on(table.userId),
    index("csm_tasks_assigned_idx").on(table.assignedTo),
    index("csm_tasks_status_idx").on(table.status),
    index("csm_tasks_due_idx").on(table.dueAt),
    index("csm_tasks_assigned_status_idx").on(table.assignedTo, table.status),
  ],
);

// ------------------------------------------------------------
// csm_activities — the customer touchpoint timeline.
//
// Every interaction (note, email, call, coaching session, system event) is one
// row. Powers the Customer 360 timeline and "days since last touch" cadence.
// ------------------------------------------------------------
export const csmActivities = pgTable(
  "csm_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => csmAccounts.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: csmActivityTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    // true when the touchpoint counts toward "CSM reached out" cadence.
    isOutreach: boolean("is_outreach").notNull().default(false),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("csm_activities_user_idx").on(table.userId),
    index("csm_activities_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
    index("csm_activities_type_idx").on(table.type),
  ],
);

// ------------------------------------------------------------
// Relations
// ------------------------------------------------------------

export const csmAccountsRelations = relations(csmAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [csmAccounts.userId],
    references: [users.id],
    relationName: "csmAccountUser",
  }),
  owner: one(users, {
    fields: [csmAccounts.ownerId],
    references: [users.id],
    relationName: "csmAccountOwner",
  }),
  healthScores: many(customerHealthScores),
  signals: many(csmSignals),
  tasks: many(csmTasks),
  activities: many(csmActivities),
}));

export const customerHealthScoresRelations = relations(
  customerHealthScores,
  ({ one }) => ({
    user: one(users, {
      fields: [customerHealthScores.userId],
      references: [users.id],
    }),
    account: one(csmAccounts, {
      fields: [customerHealthScores.accountId],
      references: [csmAccounts.id],
    }),
  }),
);

export const csmSignalsRelations = relations(csmSignals, ({ one, many }) => ({
  user: one(users, {
    fields: [csmSignals.userId],
    references: [users.id],
  }),
  account: one(csmAccounts, {
    fields: [csmSignals.accountId],
    references: [csmAccounts.id],
  }),
  tasks: many(csmTasks),
}));

export const csmPlaybooksRelations = relations(csmPlaybooks, ({ many }) => ({
  runs: many(csmPlaybookRuns),
}));

export const csmPlaybookRunsRelations = relations(
  csmPlaybookRuns,
  ({ one }) => ({
    playbook: one(csmPlaybooks, {
      fields: [csmPlaybookRuns.playbookId],
      references: [csmPlaybooks.id],
    }),
    user: one(users, {
      fields: [csmPlaybookRuns.userId],
      references: [users.id],
    }),
    signal: one(csmSignals, {
      fields: [csmPlaybookRuns.signalId],
      references: [csmSignals.id],
    }),
  }),
);

export const csmTasksRelations = relations(csmTasks, ({ one }) => ({
  user: one(users, {
    fields: [csmTasks.userId],
    references: [users.id],
    relationName: "csmTaskUser",
  }),
  assignee: one(users, {
    fields: [csmTasks.assignedTo],
    references: [users.id],
    relationName: "csmTaskAssignee",
  }),
  signal: one(csmSignals, {
    fields: [csmTasks.signalId],
    references: [csmSignals.id],
  }),
  account: one(csmAccounts, {
    fields: [csmTasks.accountId],
    references: [csmAccounts.id],
  }),
}));

export const csmActivitiesRelations = relations(csmActivities, ({ one }) => ({
  user: one(users, {
    fields: [csmActivities.userId],
    references: [users.id],
    relationName: "csmActivityUser",
  }),
  actor: one(users, {
    fields: [csmActivities.actorId],
    references: [users.id],
    relationName: "csmActivityActor",
  }),
  account: one(csmAccounts, {
    fields: [csmActivities.accountId],
    references: [csmAccounts.id],
  }),
}));

// ------------------------------------------------------------
// Type inference
// ------------------------------------------------------------

export type CsmAccount = typeof csmAccounts.$inferSelect;
export type NewCsmAccount = typeof csmAccounts.$inferInsert;
export type CustomerHealthScore = typeof customerHealthScores.$inferSelect;
export type NewCustomerHealthScore = typeof customerHealthScores.$inferInsert;
export type CsmSignal = typeof csmSignals.$inferSelect;
export type NewCsmSignal = typeof csmSignals.$inferInsert;
export type CsmPlaybook = typeof csmPlaybooks.$inferSelect;
export type NewCsmPlaybook = typeof csmPlaybooks.$inferInsert;
export type CsmPlaybookRun = typeof csmPlaybookRuns.$inferSelect;
export type NewCsmPlaybookRun = typeof csmPlaybookRuns.$inferInsert;
export type CsmTask = typeof csmTasks.$inferSelect;
export type NewCsmTask = typeof csmTasks.$inferInsert;
export type CsmActivity = typeof csmActivities.$inferSelect;
export type NewCsmActivity = typeof csmActivities.$inferInsert;

export type CsmLifecycleStage =
  (typeof csmLifecycleStageEnum.enumValues)[number];
export type CsmHealthBand = (typeof csmHealthBandEnum.enumValues)[number];
export type CsmTrend = (typeof csmTrendEnum.enumValues)[number];
export type CsmSignalType = (typeof csmSignalTypeEnum.enumValues)[number];
export type CsmSignalSeverity =
  (typeof csmSignalSeverityEnum.enumValues)[number];
export type CsmTaskStatus = (typeof csmTaskStatusEnum.enumValues)[number];
export type CsmTaskPriority = (typeof csmTaskPriorityEnum.enumValues)[number];
export type CsmActivityType = (typeof csmActivityTypeEnum.enumValues)[number];
