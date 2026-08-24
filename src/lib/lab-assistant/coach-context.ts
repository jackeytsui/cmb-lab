export type CoachAssignmentStatus =
  | "assigned"
  | "unassigned"
  | "unavailable";

export type CoachAssignmentSource = "cmb_lab" | "ghl" | null;

export interface CoachAssignment {
  status: CoachAssignmentStatus;
  name: string | null;
  source: CoachAssignmentSource;
}

export interface InternalCoachCandidate {
  name: string | null;
  role: string;
  deletedAt: Date | null;
}

export interface ResolveCoachAssignmentInput {
  assignedCoachId: string | null;
  internalCoach: InternalCoachCandidate | null;
  internalLookupFailed?: boolean;
  ghlCoachName: string | null;
}

/** Reject notes, URLs, emails, and other corrupted values stored as names. */
export function normalizeCoachDisplayName(value: string | null): string | null {
  const name = value?.trim().replace(/\s+/g, " ") || "";
  if (!name || name.length > 80) return null;
  if (name.split(" ").length > 6) return null;
  if (/https?:\/\/|www\.|@|[!?;{}<>]/i.test(name)) return null;
  return name;
}

/**
 * Resolve coach data without guessing. The CMB Lab assignment is canonical;
 * GHL remains a backwards-compatible fallback only when no CMB Lab coach has
 * been assigned yet.
 */
export function resolveCoachAssignment({
  assignedCoachId,
  internalCoach,
  internalLookupFailed = false,
  ghlCoachName,
}: ResolveCoachAssignmentInput): CoachAssignment {
  const legacyRawName = ghlCoachName?.trim() || null;
  const legacyName = normalizeCoachDisplayName(ghlCoachName);

  if (assignedCoachId) {
    if (internalLookupFailed) {
      return { status: "unavailable", name: null, source: null };
    }

    const internalName = normalizeCoachDisplayName(internalCoach?.name ?? null);
    const isEligibleCoach =
      internalCoach?.deletedAt === null &&
      (internalCoach.role === "coach" || internalCoach.role === "admin");

    if (isEligibleCoach && internalName) {
      return {
        status: "assigned",
        name: internalName,
        source: "cmb_lab",
      };
    }

    // A present assignment ID that cannot be resolved is not the same as no
    // assignment. Never fall back to a potentially stale CRM name here.
    return { status: "unavailable", name: null, source: null };
  }

  if (legacyName) {
    return { status: "assigned", name: legacyName, source: "ghl" };
  }

  if (legacyRawName) {
    return { status: "unavailable", name: null, source: null };
  }

  return { status: "unassigned", name: null, source: "cmb_lab" };
}

/** Direct assignment questions can be answered reliably without an LLM. */
export function isDirectCoachLookup(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const englishPatterns = [
    /\bwho(?:'s| is) my (?:assigned )?coach\b/,
    /\bwhat(?:'s| is) my coach(?:'s)? name\b/,
    /\bwhat(?:'s| is) the name of my coach\b/,
    /\bwhich coach (?:am i|i am) assigned to\b/,
    /\bdo i have (?:a |an )?coach\b/,
    /\bhave i been assigned (?:a |an )?coach\b/,
    /\bwho (?:has been|was|is) assigned as my coach\b/,
  ];

  return (
    englishPatterns.some((pattern) => pattern.test(normalized)) ||
    /(?:我的教[練练]是[誰谁]|我[嘅的]教[練练][係是]邊個|邊個[係是]我[嘅的]?教[練练]|我有[冇沒没]有?教[練练])/.test(
      normalized,
    )
  );
}

function isChineseMessage(message: string): boolean {
  return /\p{Script=Han}/u.test(message);
}

/** Student-facing reply for a direct coach-assignment question. */
export function coachAssignmentReply(
  assignment: CoachAssignment,
  message: string,
): string {
  const chinese = isChineseMessage(message);

  if (assignment.status === "assigned" && assignment.name) {
    return chinese
      ? `你的專屬教練是 ${assignment.name}。你可以到 CMB Lab 側邊欄的「1:1 Coaching」查看教練資料和安排。`
      : `Your assigned coach is ${assignment.name}. You can open 1:1 Coaching from the CMB Lab sidebar for your coaching details and schedule.`;
  }

  if (assignment.status === "unassigned") {
    return chinese
      ? "你目前還未分配教練。教練配對可能仍在處理中；如果你想，我可以幫你通知團隊查詢進度。"
      : "You don't have a coach assigned yet. Coach matching may still be in progress; if you'd like, I can ask the team for an update.";
  }

  return chinese
    ? "我現在無法確認你的教練安排，所以不想亂猜。如果你想，我可以幫你通知團隊核實。"
    : "I couldn't verify your coach assignment right now, so I don't want to guess. If you'd like, I can ask the team to confirm it.";
}
