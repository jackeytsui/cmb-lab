import type { UIMessage } from "ai";

export type LabAssistantCaseOutcome =
  | "awaiting_confirmation"
  | "handoff_created"
  | "handoff_failed"
  | "none";

export interface LabAssistantCaseOutcomeData {
  caseId: string;
  outcome: LabAssistantCaseOutcome;
}

/**
 * UI protocol for the student-facing assistant. The persistent outcome part
 * lets the client decide whether to offer resolution confirmation without
 * guessing from the assistant's prose.
 */
export type LabAssistantMessage = UIMessage<
  never,
  { caseOutcome: LabAssistantCaseOutcomeData }
>;

