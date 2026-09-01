import "server-only";

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activeStudents, studentTags, tags, users } from "@/db/schema";
import { fetchGhlContactDataForLink } from "@/lib/ghl/contact-fields";
import {
  getActiveGhlLocations,
  getGhlContactLinks,
} from "@/lib/ghl/contacts";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import {
  emptyConceptRecord,
  mergeLinkResolutions,
  normalizeFieldValue,
  PREFERRED_LOCATION_NAME_PATTERN,
  type LinkResolution,
} from "@/lib/lab-assistant/field-merge";
import { resolveAllowlistedFields } from "@/lib/lab-assistant/field-resolution";
import { ALLOWLISTED_FIELD_CONCEPTS } from "@/lib/lab-assistant/allowlist";
import {
  isProgramCurrent,
  matchCoachStaff,
} from "@/lib/coach-assignment-policy";

const MAX_LINKS = 5;

export type CoachAssignmentSyncStatus =
  | "assigned"
  | "would_assign"
  | "already_assigned"
  | "not_entitled"
  | "no_links"
  | "no_verified_contact"
  | "missing_coach"
  | "self_study"
  | "unknown_coach"
  | "ambiguous_coach"
  | "expired";

export type CoachAssignmentSyncResult = {
  status: CoachAssignmentSyncStatus;
  coachId?: string;
  sourceLocationId?: string;
};

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

async function hasOneOnOneAccess(userId: string) {
  const [row] = await db
    .select({ id: studentTags.id })
    .from(studentTags)
    .innerJoin(tags, eq(tags.id, studentTags.tagId))
    .where(
      and(
        eq(studentTags.userId, userId),
        eq(tags.name, "1on1_student"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function hasOneOnOnePurchase(email: string) {
  const [row] = await db
    .select({ id: activeStudents.contactId })
    .from(activeStudents)
    .where(
      and(
        ilike(activeStudents.email, email),
        ilike(activeStudents.courseEligibility, "YES"),
        ilike(activeStudents.addOnPurchased, "%1:1 coaching%"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function activeStaff() {
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(
      and(
        inArray(users.role, ["coach", "admin"]),
        isNull(users.deletedAt),
      ),
    );
}

/**
 * Fill a missing CMB coach assignment from the student's own, email-verified
 * GHL contacts. The Course sub-account is authoritative; Sales fills only a
 * blank Course field. Existing CMB assignments are never overwritten.
 */
export async function syncAssignedCoachFromGhl(params: {
  userId: string;
  email: string;
  dryRun?: boolean;
}): Promise<CoachAssignmentSyncResult> {
  const student = await db.query.users.findFirst({
    where: and(eq(users.id, params.userId), isNull(users.deletedAt)),
    columns: { assignedCoachId: true, role: true },
  });
  if (!student || student.role !== "student") return { status: "not_entitled" };
  if (student.assignedCoachId) {
    return { status: "already_assigned", coachId: student.assignedCoachId };
  }
  if (
    !(await hasOneOnOneAccess(params.userId)) &&
    !(await hasOneOnOnePurchase(params.email))
  ) {
    return { status: "not_entitled" };
  }

  const links = (await getGhlContactLinks(params.userId)).slice(0, MAX_LINKS);
  if (links.length === 0) return { status: "no_links" };

  const locations = await getActiveGhlLocations();
  const preferredLocationIds = new Set(
    locations
      .filter((location) =>
        PREFERRED_LOCATION_NAME_PATTERN.test(location.name ?? ""),
      )
      .map((location) => location.ghlLocationId),
  );
  const orderedLinks = [
    ...links.filter((link) => preferredLocationIds.has(link.ghlLocationId)),
    ...links.filter((link) => !preferredLocationIds.has(link.ghlLocationId)),
  ];

  const resolutions: LinkResolution[] = [];
  for (const link of orderedLinks) {
    const { data } = await fetchGhlContactDataForLink(link);
    if (!data || normalizeEmail(data.email) !== normalizeEmail(params.email)) {
      continue;
    }
    const resolution = await resolveAllowlistedFields(
      link.ghlLocationId,
      data.customFields,
    );
    const values = emptyConceptRecord<string | null>(null);
    for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
      values[concept] = normalizeFieldValue(
        concept,
        resolution.values[concept],
      );
    }
    resolutions.push({ ...link, values, via: resolution.via });
  }
  if (resolutions.length === 0) return { status: "no_verified_contact" };

  const merged = mergeLinkResolutions(resolutions, { preferredLocationIds });
  const endDate = merged.fields.end_date;
  if (!isProgramCurrent(endDate)) return { status: "expired" };

  const match = matchCoachStaff(
    merged.fields.assigned_coach,
    await activeStaff(),
  );
  if (match.status !== "matched") {
    return {
      status:
        match.status === "missing"
          ? "missing_coach"
          : match.status === "self_study"
            ? "self_study"
            : match.status === "ambiguous"
              ? "ambiguous_coach"
              : "unknown_coach",
      sourceLocationId:
        merged.sources.assigned_coach?.ghlLocationId ?? undefined,
    };
  }

  const sourceLocationId =
    merged.sources.assigned_coach?.ghlLocationId ?? undefined;
  if (params.dryRun) {
    return {
      status: "would_assign",
      coachId: match.coach.id,
      sourceLocationId,
    };
  }

  const [updated] = await db
    .update(users)
    .set({ assignedCoachId: match.coach.id })
    .where(
      and(
        eq(users.id, params.userId),
        isNull(users.assignedCoachId),
        isNull(users.deletedAt),
      ),
    )
    .returning({ id: users.id });

  if (!updated) return { status: "already_assigned" };

  await logSyncEvent({
    eventType: "coach.assigned",
    direction: "inbound",
    entityType: "coach_assignment",
    entityId: params.userId,
    payload: {
      source: "ghl_onboarding_reconciliation",
      coachId: match.coach.id,
      sourceLocationId,
    },
  });
  return {
    status: "assigned",
    coachId: match.coach.id,
    sourceLocationId,
  };
}

export async function reconcileMissingCoachAssignments(params?: {
  dryRun?: boolean;
  emails?: string[];
  limit?: number;
}) {
  const candidates = await db
    .selectDistinct({ id: users.id, email: users.email })
    .from(users)
    .leftJoin(studentTags, eq(studentTags.userId, users.id))
    .leftJoin(tags, eq(tags.id, studentTags.tagId))
    .leftJoin(
      activeStudents,
      sql`lower(trim(${activeStudents.email})) = lower(trim(${users.email}))`,
    )
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        isNull(users.assignedCoachId),
        or(
          eq(tags.name, "1on1_student"),
          and(
            ilike(activeStudents.courseEligibility, "YES"),
            ilike(activeStudents.addOnPurchased, "%1:1 coaching%"),
          ),
        ),
      ),
    );
  const requested = params?.emails
    ? new Set(params.emails.map((email) => normalizeEmail(email)))
    : null;
  const limited = candidates
    .filter((candidate) => !requested || requested.has(normalizeEmail(candidate.email)))
    .slice(0, Math.min(Math.max(params?.limit ?? 250, 1), 1000));

  const statuses: Record<string, number> = {};
  for (const candidate of limited) {
    try {
      const result = await syncAssignedCoachFromGhl({
        userId: candidate.id,
        email: candidate.email,
        dryRun: params?.dryRun,
      });
      statuses[result.status] = (statuses[result.status] ?? 0) + 1;
    } catch (error) {
      statuses.failed = (statuses.failed ?? 0) + 1;
      console.error(
        "[Coach Assignment] Reconciliation failed for one student:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { checked: limited.length, statuses };
}
