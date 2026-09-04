import type { ClerkClient } from "@clerk/backend";

export type PortalAccessStatus = "active" | "paused" | "expired";
type Metadata = Record<string, unknown>;
type Clerk = Pick<ClerkClient, "users" | "sessions">;

/** Date-only entitlements last through the stated day, not just midnight. */
export function courseEndTime(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(dateOnly ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(date.getTime())) return null;
  if (dateOnly && date.toISOString().slice(0, 10) !== raw) return null;
  return date.getTime();
}

export function portalAccessStatus(metadata: Metadata, now = Date.now()): PortalAccessStatus {
  const end = courseEndTime(metadata.cmbCourseEndDate);
  if (end !== null && end < now) return "expired";
  const status = metadata.cmbPortalAccessStatus;
  if (status === "expired" || status === "paused" || status === "active") return status;
  return metadata.cmbPortalAccessRevoked === true ? "paused" : "active";
}

export function normalizeCourseEndDate(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  const time = courseEndTime(trimmed);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || time === null) {
    throw new Error("Course end date must be a valid YYYY-MM-DD date");
  }
  return new Date(time).toISOString();
}

/**
 * Retain all learning records. A Clerk ban revokes sessions and prevents sign-in
 * until explicitly reversed. Plans without bans use a lock renewed by the expiry
 * job plus explicit session revocation; app authorization also checks expiry.
 * Only release bans owned by this policy, never independent security bans.
 * Callers must authorize the operation. This helper never sends email or writes GHL.
 */
export async function setPortalAccess(
  clerk: Clerk,
  clerkId: string,
  options: { status: PortalAccessStatus; courseEndDate?: string | null; reason: string; enforceExisting?: boolean },
  now = new Date(),
) {
  const user = await clerk.users.getUser(clerkId);
  const metadata = user.publicMetadata as Metadata;
  const courseEndDate = options.courseEndDate === undefined
    ? metadata.cmbCourseEndDate ?? null
    : normalizeCourseEndDate(options.courseEndDate);
  const status = portalAccessStatus({
    ...metadata,
    cmbPortalAccessStatus: options.enforceExisting ? metadata.cmbPortalAccessStatus : options.status,
    cmbCourseEndDate: courseEndDate,
  }, now.getTime());
  const managed = user.privateMetadata.cmbPortalLoginBlockManaged === true;
  // Scheduled/lazy enforcement may only restrict the latest state, never lift a ban.
  if (options.enforceExisting && status === "active") {
    return { status, courseEndDate: typeof courseEndDate === "string" ? courseEndDate.slice(0, 10) : null };
  }
  const end = courseEndTime(courseEndDate);
  const reason = end !== null && end < now.getTime()
    ? "course_end_date_expired"
    : options.reason;

  if (status === "active") {
    if (user.banned && !managed) {
      throw new Error("This account has a separate security ban; review it before reactivating access");
    }
    if (user.banned) await clerk.users.unbanUser(clerkId);
    if (user.locked) await clerk.users.unlockUser(clerkId);
    await clerk.users.updateUserMetadata(clerkId, {
      publicMetadata: {
        cmbPortalAccessStatus: status,
        cmbCourseEndDate: courseEndDate,
        cmbPortalAccessRevoked: false,
        cmbPortalAccessRevokedAt: null,
        cmbPortalAccessRevokedReason: null,
      },
      privateMetadata: { cmbPortalLoginBlockManaged: null, cmbPortalLoginLockManaged: null },
    });
  } else {
    // Fail closed in the app even if the auth provider is temporarily unavailable.
    await clerk.users.updateUserMetadata(clerkId, {
      publicMetadata: {
        cmbPortalAccessStatus: status,
        cmbCourseEndDate: courseEndDate,
        cmbPortalAccessRevoked: true,
        cmbPortalAccessRevokedAt: metadata.cmbPortalAccessRevokedAt || now.toISOString(),
        cmbPortalAccessRevokedReason: reason,
      },
      ...(!user.banned || managed
        ? { privateMetadata: { cmbPortalLoginBlockManaged: true } }
        : {}),
    });
    // Do not swallow failures: staff must not be told sign-in was blocked if it wasn't.
    if (!user.banned) {
      let useLock = user.privateMetadata.cmbPortalLoginLockManaged === true;
      if (!useLock) {
        try {
          await clerk.users.banUser(clerkId);
        } catch (error) {
          const failure = error as { status?: number; errors?: Array<{ code?: string }> };
          if (failure.status !== 402 || !failure.errors?.some((e) => e.code === "unsupported_subscription_plan_features")) throw error;
          useLock = true;
        }
      }
      if (useLock) {
        // Never claim ownership of a security ban when the plan rejected ours.
        await clerk.users.updateUserMetadata(clerkId, {
          privateMetadata: { cmbPortalLoginBlockManaged: null, cmbPortalLoginLockManaged: true },
        });
        // Renew on every enforcement pass: locks can expire; portal expiry does not.
        await clerk.users.lockUser(clerkId);
        for (;;) {
          const active = await clerk.sessions.getSessionList({ userId: clerkId, status: "active", limit: 100 });
          if (!active.data.length) break;
          for (const session of active.data) await clerk.sessions.revokeSession(session.id);
          if (active.data.length < 100) break;
        }
      }
    }
  }
  return { status, courseEndDate: typeof courseEndDate === "string" ? courseEndDate.slice(0, 10) : null };
}
