import "server-only";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { roleFeatures, roles, userRoles, users } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Assignment review authorization ("Challenge Reviewer").
//
// Review access is a capability (feature key) granted through the existing
// role-bundle system, so it is additive: a user can be Coach AND Challenge
// Reviewer at the same time. Admins always have every capability.
//
// Future assignment types add their own capability key here, e.g.
// { audio_assignment: "assignment_review_audio" }.
// ---------------------------------------------------------------------------

export const ASSIGNMENT_REVIEW_FEATURE_KEYS = {
  text_assignment: "assignment_review_text",
  vocal_hack: "assignment_review_vocal",
  diary: "assignment_review_diary",
} as const;

export type ReviewableAssignmentType =
  keyof typeof ASSIGNMENT_REVIEW_FEATURE_KEYS;

/** All capability keys that grant access to the submissions dashboard. */
export const ALL_ASSIGNMENT_REVIEW_FEATURE_KEYS = Object.values(
  ASSIGNMENT_REVIEW_FEATURE_KEYS,
);

/**
 * Check whether a user can review the given assignment type.
 * Admins always can; everyone else needs the capability via a role bundle
 * (e.g. the seeded "Challenge Reviewer" role).
 */
export async function userCanReviewAssignments(
  user: { id: string; role: string },
  assignmentType: ReviewableAssignmentType = "text_assignment",
): Promise<boolean> {
  if (user.role === "admin") return true;
  const permissions = await resolvePermissions(user.id);
  return permissions.canUseFeature(
    ASSIGNMENT_REVIEW_FEATURE_KEYS[assignmentType],
  );
}

/**
 * Resolve the real authenticated user if they are an authorized assignment
 * reviewer (admin or capability holder); otherwise null.
 * Use in assignment-review API routes and admin pages.
 */
export async function getAssignmentReviewer(
  assignmentType: ReviewableAssignmentType = "text_assignment",
) {
  const user = await getRealUser();
  if (!user) return null;
  const allowed = await userCanReviewAssignments(user, assignmentType);
  return allowed ? user : null;
}

/**
 * Resolve the real authenticated user if they can review ANY assignment type
 * (admin, Challenge Reviewer, Vocal Hack Reviewer, ...). Use for the shared
 * submissions dashboard; per-type authorization stays in the review routes.
 */
export async function getAnyAssignmentReviewer() {
  const user = await getRealUser();
  if (!user) return null;
  if (user.role === "admin") return user;
  const permissions = await resolvePermissions(user.id);
  const allowed = ALL_ASSIGNMENT_REVIEW_FEATURE_KEYS.some((key) =>
    permissions.canUseFeature(key),
  );
  return allowed ? user : null;
}

export interface EligibleReviewer {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

/**
 * List users who hold an assignment-review capability through a role bundle
 * (e.g. the "Challenge Reviewer" role) — excluding admins, who have the
 * capability implicitly but aren't the intended default assignees. Used to
 * auto-assign new submissions on submit.
 */
export async function listChallengeReviewers(
  assignmentType: ReviewableAssignmentType = "text_assignment",
): Promise<EligibleReviewer[]> {
  const now = new Date();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(roleFeatures, eq(roleFeatures.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(
          roleFeatures.featureKey,
          ASSIGNMENT_REVIEW_FEATURE_KEYS[assignmentType],
        ),
        isNull(roles.deletedAt),
        isNull(users.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
      ),
    );

  const byId = new Map<string, EligibleReviewer>();
  for (const reviewer of rows) byId.set(reviewer.id, reviewer);
  return Array.from(byId.values()).sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}

/**
 * List users who can be assigned as assignment reviewers: all admins plus
 * every user holding an active role bundle with a review capability.
 */
export async function listEligibleReviewers(): Promise<EligibleReviewer[]> {
  const now = new Date();

  const [admins, capabilityHolders] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt))),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(roleFeatures, eq(roleFeatures.roleId, roles.id))
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(
        and(
          inArray(roleFeatures.featureKey, ALL_ASSIGNMENT_REVIEW_FEATURE_KEYS),
          isNull(roles.deletedAt),
          isNull(users.deletedAt),
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
        ),
      ),
  ]);

  const byId = new Map<string, EligibleReviewer>();
  for (const reviewer of [...admins, ...capabilityHolders]) {
    byId.set(reviewer.id, reviewer);
  }
  return Array.from(byId.values()).sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}
