import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), find: vi.fn(), cookies: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/db", () => ({ db: { query: { users: { findFirst: mocks.find } } } }));
import { getRealUser, getCurrentUser } from "@/lib/auth";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "real" });
  mocks.currentUser.mockResolvedValue({ publicMetadata: { cmbPortalAccessStatus: "expired" } });
  mocks.cookies.mockResolvedValue({ get: () => undefined });
});
describe("retained record authorization", () => {
  it("denies an expired student's real authenticated identity", async () => {
    mocks.find.mockResolvedValue({ id: "dan", role: "student", deletedAt: null });
    expect(await getRealUser()).toBeNull();
  });
  it("keeps an active student's access", async () => {
    mocks.find.mockResolvedValue({ id: "active", role: "student", deletedAt: null });
    mocks.currentUser.mockResolvedValue({ publicMetadata: { cmbPortalAccessStatus: "active" } });
    expect(await getRealUser()).toMatchObject({ id: "active" });
  });
  it.each(["coach", "admin"])("does not apply the viewed student's expiry to a real %s", async (role) => {
    mocks.find.mockResolvedValue({ id: "staff", role });
    expect(await getRealUser()).toMatchObject({ id: "staff" });
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });
  it("still lets an admin view the retained expired student", async () => {
    mocks.find.mockResolvedValueOnce({ id: "admin", role: "admin" }).mockResolvedValueOnce({ id: "dan", role: "student" });
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "dan" }) });
    expect(await getCurrentUser()).toMatchObject({ id: "dan" });
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });
});
