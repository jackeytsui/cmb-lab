import type {
  CustomerSignals,
  DerivedSignal,
  HealthResult,
  NextBestAction,
} from "./types";
import type { CsmSignalType } from "@/db/schema";

// ============================================================
// Playbook & next-best-action engine
//
// Two layers:
//  1. recommendNextBestActions — deterministic, rule-based mapping from the
//     detected signals to concrete, prioritised actions a CSM (or automation)
//     should take. This is the "automate-first, escalate-on-failure" logic:
//     low-touch signals suggest an automated nudge; acute signals escalate to
//     a human task. It's the fallback when no AI copilot is configured, and the
//     structured scaffold an AI copilot fills with personalised copy.
//  2. DEFAULT_PLAYBOOKS — a seed catalogue of config-as-data playbooks that can
//     be inserted into csm_playbooks, so success ops start with working
//     automations they can edit rather than a blank slate.
// ============================================================

interface ActionTemplate {
  key: string;
  title: string;
  description: string;
  priority: NextBestAction["priority"];
}

/** Maps a signal type to its recommended first action. */
const ACTION_BY_SIGNAL: Record<CsmSignalType, ActionTemplate> = {
  onboarding_stall: {
    key: "kickstart_onboarding",
    title: "Kick-start onboarding",
    description:
      "Send a personalised welcome + first-lesson nudge; if no response in 48h, book a 10-min onboarding call. Time-to-first-value is the #1 churn lever.",
    priority: "urgent",
  },
  inactivity: {
    key: "reengage_inactive",
    title: "Re-engage inactive student",
    description:
      "Send an automated 'we miss you' nudge referencing their last lesson and streak. Escalate to a coach check-in if still inactive after the nudge.",
    priority: "high",
  },
  stalled_progress: {
    key: "unblock_progress",
    title: "Unblock stalled progress",
    description:
      "Identify the lesson they're stuck on and offer targeted help (a walkthrough, a practice set, or a coaching slot).",
    priority: "high",
  },
  low_satisfaction: {
    key: "recover_satisfaction",
    title: "Recover satisfaction",
    description:
      "Personal outreach from the owner to understand the dissatisfaction, acknowledge it, and agree a recovery plan. Log the reason code.",
    priority: "urgent",
  },
  coaching_gap: {
    key: "schedule_coaching",
    title: "Schedule a coaching session",
    description:
      "It's been too long since the last coaching touch. Offer the next available slot to keep the relationship warm.",
    priority: "medium",
  },
  streak_broken: {
    key: "rebuild_habit",
    title: "Help rebuild the habit",
    description:
      "Send an encouraging nudge to restart the streak with a small, achievable daily goal.",
    priority: "low",
  },
  payment_risk: {
    key: "resolve_billing",
    title: "Resolve billing issue",
    description:
      "Trigger dunning + a friendly personal note. A failed payment is the most direct churn signal — act within 24h.",
    priority: "urgent",
  },
  renewal_upcoming: {
    key: "prepare_renewal",
    title: "Prepare for renewal",
    description:
      "Assemble a value recap (lessons completed, progress made) and reach out ahead of the renewal date to reinforce ROI.",
    priority: "high",
  },
  expansion_signal: {
    key: "offer_expansion",
    title: "Offer an expansion",
    description:
      "This student is thriving. Propose the next tier, a 1:1 add-on, or invite them to refer a friend.",
    priority: "medium",
  },
  milestone_reached: {
    key: "celebrate_milestone",
    title: "Celebrate the milestone",
    description:
      "Send a congratulations + certificate and ask for a testimonial while motivation is high.",
    priority: "low",
  },
  champion: {
    key: "nurture_champion",
    title: "Nurture a champion",
    description:
      "Invite to a referral/ambassador program and request a review or case study.",
    priority: "medium",
  },
};

const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as const;
const PRIORITY_RANK = { urgent: 4, high: 3, medium: 2, low: 1 } as const;

/**
 * Produce a prioritised list of next-best-actions for a customer. Sorted by the
 * action's own priority first (so an `urgent` billing fix beats a `high`
 * re-engagement even when both stem from critical signals), with the motivating
 * signal's severity as the tie-breaker.
 */
export function recommendNextBestActions(
  _signals: CustomerSignals,
  health: HealthResult,
  derived: DerivedSignal[],
): NextBestAction[] {
  const actions: NextBestAction[] = derived
    .map((sig) => ({ sig, action: ACTION_BY_SIGNAL[sig.type] }))
    .sort((a, b) => {
      const byPriority =
        PRIORITY_RANK[b.action.priority] - PRIORITY_RANK[a.action.priority];
      if (byPriority !== 0) return byPriority;
      return SEVERITY_RANK[b.sig.severity] - SEVERITY_RANK[a.sig.severity];
    })
    .map(({ sig, action }) => ({
      key: action.key,
      title: action.title,
      description: action.description,
      priority: action.priority,
      reason: sig.type,
    }));

  // If nothing fired but health is merely "watch", suggest a light check-in.
  if (actions.length === 0 && (health.band === "watch" || health.band === "at_risk")) {
    actions.push({
      key: "proactive_checkin",
      title: "Proactive check-in",
      description:
        "No acute signal, but health is trending down. A brief personal check-in can prevent a slide into risk.",
      priority: "low",
      reason: "health",
    });
  }

  return actions;
}

// ------------------------------------------------------------
// Seed catalogue of config-as-data playbooks.
// ------------------------------------------------------------

export interface PlaybookSeed {
  name: string;
  description: string;
  trigger: "signal" | "lifecycle_stage" | "health_band" | "manual" | "schedule";
  triggerConfig: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  setLifecycleStage?:
    | "onboarding"
    | "adopting"
    | "established"
    | "at_risk"
    | "renewal"
    | "expansion"
    | "churned"
    | "reactivated";
}

export const DEFAULT_PLAYBOOKS: PlaybookSeed[] = [
  {
    name: "Onboarding Rescue",
    description:
      "Fires when a newly-enrolled student hasn't completed a first lesson. Automated nudge, then coach escalation.",
    trigger: "signal",
    triggerConfig: { signalType: "onboarding_stall", minSeverity: "high" },
    steps: [
      { type: "send_email", template: "welcome_nudge", delayHours: 0, requiresApproval: false },
      { type: "wait", hours: 48 },
      { type: "create_task", title: "Book 10-min onboarding call", priority: "urgent" },
      { type: "notify_owner", channel: "in_app" },
    ],
    setLifecycleStage: "onboarding",
  },
  {
    name: "Re-Engagement",
    description:
      "Fires on inactivity. Sends a personalised 'we miss you' nudge; escalates to the coach if still inactive.",
    trigger: "signal",
    triggerConfig: { signalType: "inactivity", minSeverity: "medium" },
    steps: [
      { type: "send_email", template: "we_miss_you", delayHours: 0, requiresApproval: false },
      { type: "wait", hours: 72 },
      { type: "branch", condition: "still_inactive", ifTrue: [{ type: "create_task", title: "Personal coach check-in", priority: "high" }] },
    ],
    setLifecycleStage: "at_risk",
  },
  {
    name: "Billing Recovery",
    description: "Fires on a failed/overdue payment. Dunning + personal note within 24h.",
    trigger: "signal",
    triggerConfig: { signalType: "payment_risk", minSeverity: "critical" },
    steps: [
      { type: "send_email", template: "dunning_soft", delayHours: 0 },
      { type: "create_task", title: "Personal note re: billing", priority: "urgent", dueHours: 24 },
      { type: "notify_owner", channel: "in_app" },
    ],
  },
  {
    name: "Renewal Prep",
    description: "Fires ahead of a renewal date. Assembles a value recap and schedules outreach.",
    trigger: "signal",
    triggerConfig: { signalType: "renewal_upcoming" },
    steps: [
      { type: "generate_value_recap" },
      { type: "create_task", title: "Send renewal value recap", priority: "high" },
    ],
    setLifecycleStage: "renewal",
  },
  {
    name: "Expansion Play",
    description: "Fires when a thriving student looks ready for an upsell, referral, or testimonial.",
    trigger: "signal",
    triggerConfig: { signalType: "expansion_signal" },
    steps: [
      { type: "create_task", title: "Offer next tier / referral invite", priority: "medium" },
    ],
    setLifecycleStage: "expansion",
  },
];
