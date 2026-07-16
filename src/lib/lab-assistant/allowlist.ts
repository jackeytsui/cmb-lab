// src/lib/lab-assistant/allowlist.ts
// Data gatekeeping for the CMB Lab Assistant (non-negotiable).
// The AI never calls GHL directly. The middleware in student-context.ts
// resolves the signed-in student's single GHL record and injects ONLY the
// fields listed here into the model context. Everything else (payments,
// notes, other contacts, bulk queries) is default DENY: it is structurally
// unreachable because no other data is ever loaded into the request.

/**
 * GHL custom-field concepts the assistant is allowed to see.
 * These must be mapped in Admin → GHL → Field Mappings (lmsConcept column)
 * for values to resolve; unmapped concepts surface as null (friendly
 * "not set" phrasing in the bot, never internal field names).
 */
export const ALLOWLISTED_FIELD_CONCEPTS = [
  "start_date",
  "end_date",
  "assigned_coach",
  "referral_source",
  "referral_status",
] as const;

export type AllowlistedFieldConcept = (typeof ALLOWLISTED_FIELD_CONCEPTS)[number];

/** Support inbox surfaced for urgent issues and escalation fallbacks. */
export const SUPPORT_EMAIL = "contact@thecmblueprint.com";

/**
 * Launch-scope intents (5) plus the classifier's non-actionable buckets.
 * - smalltalk: greetings/thanks — answered directly, never escalated
 * - other: off-scope or unclear — never guessed, always escalated
 */
export const LAB_ASSISTANT_INTENTS = [
  "start_date",
  "end_date",
  "my_coach",
  "referral",
  "testimonial_sheldon",
  "smalltalk",
  "other",
] as const;

export type LabAssistantIntent = (typeof LAB_ASSISTANT_INTENTS)[number];

/** Below this classification confidence a message is treated as unresolved → escalate. */
export const INTENT_CONFIDENCE_THRESHOLD = 0.6;
