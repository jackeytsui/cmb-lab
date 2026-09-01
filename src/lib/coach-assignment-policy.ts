export type CoachStaffCandidate = {
  id: string;
  email: string;
  name: string | null;
};

export type CoachNameMatch =
  | { status: "matched"; coach: CoachStaffCandidate }
  | { status: "self_study" }
  | { status: "missing" }
  | { status: "ambiguous" | "unknown" };

export function normalizeCoachSourceName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isSelfStudyCoachName(value: string) {
  const normalized = normalizeCoachSourceName(value);
  return (
    normalized === "no coach" ||
    normalized.includes("self study") ||
    normalized.includes("not assigned") ||
    normalized === "none"
  );
}

function uniqueMatch(candidates: CoachStaffCandidate[]): CoachNameMatch {
  if (candidates.length === 1) {
    return { status: "matched", coach: candidates[0] };
  }
  return { status: candidates.length > 1 ? "ambiguous" : "unknown" };
}

/**
 * Match GHL's human-readable coach field to an active CMB staff account.
 * Full names and email usernames win; a first name is accepted only when it
 * uniquely identifies one staff member.
 */
export function matchCoachStaff(
  sourceName: string | null | undefined,
  staff: CoachStaffCandidate[],
): CoachNameMatch {
  const normalized = normalizeCoachSourceName(sourceName ?? "");
  if (!normalized) return { status: "missing" };
  if (isSelfStudyCoachName(normalized)) return { status: "self_study" };

  const fullMatches = staff.filter((candidate) => {
    const fullName = normalizeCoachSourceName(candidate.name ?? "");
    const emailName = normalizeCoachSourceName(
      candidate.email.split("@")[0] ?? "",
    );
    return normalized === fullName || normalized === emailName;
  });
  if (fullMatches.length > 0) return uniqueMatch(fullMatches);

  const firstNameMatches = staff.filter((candidate) => {
    const firstName = normalizeCoachSourceName(candidate.name ?? "").split(" ")[0];
    return Boolean(firstName) && normalized === firstName;
  });
  return uniqueMatch(firstNameMatches);
}

/** GHL program end dates are date-only and remain active through that date. */
export function isProgramCurrent(
  endDate: string | null | undefined,
  todayIso = new Date().toISOString().slice(0, 10),
) {
  return !endDate || endDate >= todayIso;
}
