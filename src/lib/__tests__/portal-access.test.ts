import { describe, expect, it, vi } from "vitest";
import type { ClerkClient } from "@clerk/backend";
import { courseEndTime, normalizeCourseEndDate, portalAccessStatus, setPortalAccess } from "@/lib/portal-access";
import { reconcileStudentAccessExpiry } from "@/lib/student-access-expiry";

const now = new Date("2026-09-03T12:00:00.000Z");
function fixture(publicMetadata: Record<string, unknown> = {}, extras: Record<string, unknown> = {}) {
  const user = { id: "user_dan", publicMetadata, privateMetadata: {}, banned: false, locked: false, ...extras };
  const api = {
    getUser: vi.fn(async () => user),
    getUserList: vi.fn(async () => ({ data: [user] })),
    updateUserMetadata: vi.fn(async (_id, patch) => {
      Object.assign(user.publicMetadata, patch.publicMetadata);
      Object.assign(user.privateMetadata, patch.privateMetadata);
      return user;
    }),
    banUser: vi.fn(async () => { user.banned = true; return user; }),
    lockUser: vi.fn(async () => { user.locked = true; return user; }),
    unbanUser: vi.fn(async () => { user.banned = false; return user; }),
    unlockUser: vi.fn(async () => { user.locked = false; return user; }),
  };
  const sessions = {
    getSessionList: vi.fn(async () => ({ data: [] as Array<{ id: string }> })),
    revokeSession: vi.fn(async (_id: string) => ({})),
  };
  return { user, api, sessions, clerk: { users: api, sessions } as unknown as Pick<ClerkClient, "users" | "sessions"> };
}

describe("retained student access policy", () => {
  it("keeps date-only entitlements valid through the entire end date", () => {
    const metadata = { cmbCourseEndDate: "2026-09-03", cmbPortalAccessStatus: "active" };
    expect(portalAccessStatus(metadata, now.getTime())).toBe("active");
    expect(portalAccessStatus(metadata, Date.parse("2026-09-04T00:00:00Z"))).toBe("expired");
  });
  it.each([null, "invalid", "2026-02-30", ""]) ("does not guess an end date from %s", (value) => {
    expect(courseEndTime(value)).toBeNull();
  });
  it("validates input dates and allows an explicit clear", () => {
    expect(() => normalizeCourseEndDate("2026-02-30")).toThrow();
    expect(() => normalizeCourseEndDate("9/3/2026")).toThrow();
    expect(normalizeCourseEndDate(null)).toBeNull();
    expect(normalizeCourseEndDate("2026-09-03")).toBe("2026-09-03T23:59:59.999Z");
  });
  it("keeps manual expiry even with a future end date", () => {
    expect(portalAccessStatus({ cmbPortalAccessStatus: "expired", cmbCourseEndDate: "2027-01-01" }, now.getTime())).toBe("expired");
    expect(portalAccessStatus({ cmbPortalAccessRevoked: true }, now.getTime())).toBe("paused");
  });
  it("expires access with a durable ban, preserving dates and unrelated metadata", async () => {
    const { clerk, api, user } = fixture({ cmbCourseEndDate: "2026-08-23", cmbInviteTags: ["cmb_student"], preference: "traditional" });
    const result = await setPortalAccess(clerk, user.id, { status: "expired", reason: "admin_manual_expired" }, now);
    expect(result).toEqual({ status: "expired", courseEndDate: "2026-08-23" });
    expect(api.banUser).toHaveBeenCalledOnce();
    expect(user.publicMetadata.cmbInviteTags).toEqual(["cmb_student"]);
    expect(user.publicMetadata.preference).toBe("traditional");
    expect(user.privateMetadata).toEqual({ cmbPortalLoginBlockManaged: true });
    expect(api.unbanUser).not.toHaveBeenCalled();
  });
  it("cannot activate an already-ended term even in a bulk status-only change", async () => {
    const { clerk, user } = fixture({ cmbCourseEndDate: "2026-08-23", cmbPortalAccessStatus: "expired" });
    expect((await setPortalAccess(clerk, user.id, { status: "active", reason: "admin_bulk_active" }, now)).status).toBe("expired");
    expect(user.banned).toBe(true);
  });
  it("can explicitly renew and reactivate a portal-managed block", async () => {
    const { clerk, api, user } = fixture({ cmbCourseEndDate: "2026-08-23", cmbPortalAccessStatus: "expired" }, {
      banned: true, locked: true, privateMetadata: { cmbPortalLoginBlockManaged: true },
    });
    expect((await setPortalAccess(clerk, user.id, { status: "active", courseEndDate: "2026-12-31", reason: "admin_manual_active" }, now)).status).toBe("active");
    expect(api.unbanUser).toHaveBeenCalledOnce();
    expect(api.unlockUser).toHaveBeenCalledOnce();
    expect(user.publicMetadata.cmbPortalAccessRevoked).toBe(false);
  });
  it("does not take ownership of or release an unrelated security ban", async () => {
    const { clerk, api, user } = fixture({}, { banned: true });
    await setPortalAccess(clerk, user.id, { status: "expired", reason: "admin" }, now);
    expect(user.privateMetadata).toEqual({});
    await expect(setPortalAccess(clerk, user.id, { status: "active", reason: "admin" }, now)).rejects.toThrow("security ban");
    expect(api.unbanUser).not.toHaveBeenCalled();
  });
  it("surfaces ban failures instead of reporting success", async () => {
    const { clerk, api, user } = fixture();
    api.banUser.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(setPortalAccess(clerk, user.id, { status: "expired", reason: "admin" }, now)).rejects.toThrow("provider unavailable");
    expect(user.publicMetadata.cmbPortalAccessStatus).toBe("expired");
  });
  it("uses renewable locks and revokes sessions when bans require an upgrade", async () => {
    const { clerk, api, sessions, user } = fixture();
    api.banUser.mockRejectedValueOnce({ status: 402, errors: [{ code: "unsupported_subscription_plan_features" }] });
    sessions.getSessionList.mockResolvedValueOnce({ data: [{ id: "old-session" }] });
    await setPortalAccess(clerk, user.id, { status: "expired", reason: "admin" }, now);
    expect(user.locked).toBe(true);
    expect(sessions.revokeSession).toHaveBeenCalledWith("old-session");
    expect(user.privateMetadata).toMatchObject({ cmbPortalLoginBlockManaged: null, cmbPortalLoginLockManaged: true });
    api.banUser.mockClear();
    await setPortalAccess(clerk, user.id, { status: "expired", reason: "cron", enforceExisting: true }, now);
    expect(api.banUser).not.toHaveBeenCalled();
    expect(api.lockUser).toHaveBeenCalledTimes(2);
  });
  it("reports fallback lock failures, too", async () => {
    const { clerk, api, user } = fixture({}, { privateMetadata: { cmbPortalLoginLockManaged: true } });
    api.lockUser.mockRejectedValueOnce(new Error("lock failed"));
    await expect(setPortalAccess(clerk, user.id, { status: "expired", reason: "admin" }, now)).rejects.toThrow("lock failed");
  });
  it("scheduled enforcement respects a concurrent extension and never unbans", async () => {
    const { clerk, api, user } = fixture({ cmbPortalAccessStatus: "active", cmbCourseEndDate: "2027-01-01" }, { banned: true });
    await setPortalAccess(clerk, user.id, { status: "expired", reason: "cron", enforceExisting: true }, now);
    expect(api.updateUserMetadata).not.toHaveBeenCalled();
    expect(api.unbanUser).not.toHaveBeenCalled();
  });
});

describe("scheduled expiry", () => {
  const students = [{ id: "dan", clerkId: "user_dan" }];
  it("has a read-only dry run", async () => {
    const { clerk, api } = fixture({ cmbCourseEndDate: "2026-08-23" });
    expect(await reconcileStudentAccessExpiry(clerk, students, { dryRun: true, now })).toMatchObject({ checked: 1, restricted: 1, failed: 0 });
    expect(api.updateUserMetadata).not.toHaveBeenCalled();
    expect(api.banUser).not.toHaveBeenCalled();
  });
  it("blocks expired students without touching active students", async () => {
    const { clerk, api, user } = fixture({ cmbCourseEndDate: "2026-08-23" });
    expect(await reconcileStudentAccessExpiry(clerk, students, { now })).toMatchObject({ restricted: 1, failed: 0 });
    expect(user.banned).toBe(true);
    api.banUser.mockClear();
    expect(await reconcileStudentAccessExpiry(clerk, students, { now })).toMatchObject({ unchanged: 1, restricted: 0 });
    expect(api.banUser).not.toHaveBeenCalled();
  });
  it("leaves active students alone", async () => {
    const { clerk, api } = fixture({ cmbCourseEndDate: "2027-01-01" });
    expect(await reconcileStudentAccessExpiry(clerk, students, { now })).toMatchObject({ unchanged: 1, restricted: 0 });
    expect(api.updateUserMetadata).not.toHaveBeenCalled();
  });
  it("reports missing auth accounts without creating replacements", async () => {
    const { clerk, api } = fixture();
    api.getUserList.mockResolvedValueOnce({ data: [] });
    expect(await reconcileStudentAccessExpiry(clerk, students, { now })).toMatchObject({ missingClerk: 1, failed: 1 });
    expect(api.updateUserMetadata).not.toHaveBeenCalled();
  });
});
