import type { ClerkClient } from "@clerk/backend";
import { portalAccessStatus, setPortalAccess } from "@/lib/portal-access";

/** Enforce existing access decisions, never reactivate or delete accounts. */
export async function reconcileStudentAccessExpiry(
  clerk: Pick<ClerkClient, "users">,
  students: Array<{ id: string; clerkId: string }>,
  { dryRun = false, now = new Date() } = {},
) {
  const result = { checked: 0, restricted: 0, unchanged: 0, failed: 0, missingClerk: 0, dryRun };
  // Fetch bounded pages, not one API request per student. Include all pages even
  // if Clerk's response order differs from the input IDs.
  for (let offset = 0; offset < students.length; offset += 100) {
    const batch = students.slice(offset, offset + 100);
    const { data } = await clerk.users.getUserList({ userId: batch.map((u) => u.clerkId), limit: 100 });
    result.checked += batch.length;
    const missing = batch.length - data.length;
    result.missingClerk += missing;
    result.failed += missing;
    for (const user of data) {
      const status = portalAccessStatus(user.publicMetadata, now.getTime());
      if (status === "active" || (user.banned && user.publicMetadata.cmbPortalAccessStatus === status)) {
        result.unchanged++;
        continue;
      }
      try {
        if (!dryRun) {
          // Re-read before applying so a concurrent admin extension wins.
          const fresh = await clerk.users.getUser(user.id);
          const freshStatus = portalAccessStatus(fresh.publicMetadata, now.getTime());
          if (freshStatus === "active") {
            result.unchanged++;
            continue;
          }
          const applied = await setPortalAccess(clerk, user.id, {
            status: freshStatus,
            enforceExisting: true,
            reason: typeof fresh.publicMetadata.cmbPortalAccessRevokedReason === "string"
              ? fresh.publicMetadata.cmbPortalAccessRevokedReason
              : "scheduled_access_enforcement",
          }, now);
          if (applied.status === "active") {
            result.unchanged++;
            continue;
          }
        }
        result.restricted++;
      } catch (error) {
        result.failed++;
        console.error(`[Student expiry] Failed for Clerk user ${user.id}:`, error);
      }
    }
  }
  return result;
}
