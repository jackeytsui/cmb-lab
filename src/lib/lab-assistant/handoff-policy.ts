import { SUPPORT_EMAIL } from "./allowlist";

export const HANDOFF_SUBMITTER_EMAIL = "jackey.tsui@thecmblueprint.com";
export const HANDOFF_ASSIGNEE_EMAIL = SUPPORT_EMAIL;
export const STANDARD_HANDOFF_DUE_HOURS = 48;
export const URGENT_HANDOFF_DUE_HOURS = 4;
export const HANDOFF_RESPONSE_WINDOW = "48 hours";

const MAX_SUMMARY_LENGTH = 500;

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function normalizeHandoffSummary(
  generatedSummary: string | null | undefined,
  latestStudentMessage: string | null | undefined,
  escalationReason?: string | null,
): string {
  const latest = compact(latestStudentMessage);
  const base =
    compact(generatedSummary) ||
    (latest
      ? `Student is asking for support with: ${latest}`
      : "Student requested human support through the CMB Lab Assistant.");
  const reason = compact(escalationReason);
  const combined = reason ? `${base} Handoff reason: ${reason}` : base;

  return combined.length > MAX_SUMMARY_LENGTH
    ? `${combined.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`
    : combined;
}

export function buildHandoffTaskBody(input: {
  studentName: string;
  studentEmail: string;
  summary: string;
  intent: string | null;
  confidence: number | null;
  urgent: boolean;
  timestamp: Date;
  transcript: string;
  request?: string;
}): string {
  return [
    `Submitted by: ${HANDOFF_SUBMITTER_EMAIL}`,
    `Assigned to: ${HANDOFF_ASSIGNEE_EMAIL}`,
    `Student: ${input.studentName} <${input.studentEmail}>`,
    `Student email: ${input.studentEmail}`,
    ...(input.request ? [`Request: ${input.request}`] : []),
    `Conversation summary: ${input.summary}`,
    `Detected intent: ${input.intent ?? "unclassified"}`,
    `Confidence: ${
      input.confidence !== null ? input.confidence.toFixed(2) : "n/a"
    }`,
    `Urgent: ${input.urgent ? "YES — same-day follow-up" : "no"}`,
    `Timestamp: ${input.timestamp.toISOString()}`,
    "",
    "--- Full transcript ---",
    input.transcript,
  ].join("\n");
}
