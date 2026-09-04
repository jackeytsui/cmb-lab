import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), current: vi.fn(), find: vi.fn(), rows: vi.fn(), update: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ hasMinimumRole: mocks.admin, getCurrentUser: mocks.current }));
vi.mock("@/db", () => ({ db: {
  query: { users: { findFirst: mocks.find } },
  select: () => ({ from: () => ({ where: mocks.rows }) }),
  update: mocks.update,
} }));
import { DELETE } from "@/app/api/admin/students/[studentId]/route";
import { POST } from "@/app/api/admin/students/bulk-delete/route";
import { GET as cron } from "@/app/api/cron/student-access-expiry/route";

const studentId = "f754b0b4-6932-429b-a082-24b03f01bee4";
const context = { params: Promise.resolve({ studentId }) };
const request = () => new NextRequest("https://lab.test/api/admin/students/bulk-delete", {
  method: "POST", body: JSON.stringify({ userIds: [studentId] }),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin_auth" });
  mocks.admin.mockResolvedValue(true);
  mocks.current.mockResolvedValue({ id: "admin_db" });
  mocks.find.mockResolvedValue({ id: studentId, role: "student", clerkId: "student_auth" });
  mocks.rows.mockResolvedValue([{ id: studentId, role: "student", clerkId: "student_auth" }]);
});

describe("student record retention routes", () => {
  it("rejects a legacy single-student delete without touching records", async () => {
    const response = await DELETE(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Expired");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a bulk batch containing a student before changing any account", async () => {
    mocks.rows.mockResolvedValue([{ id: "staff", role: "coach" }, { id: studentId, role: "student" }]);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires authentication and admin authorization", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await DELETE(request(), context)).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "coach" });
    mocks.admin.mockResolvedValue(false);
    expect((await DELETE(request(), context)).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not run the expiry job without its exact secret", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect((await cron(new Request("https://lab.test/api/cron/student-access-expiry"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(new Request("https://lab.test/api/cron/student-access-expiry", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    vi.unstubAllEnvs();
    expect(mocks.rows).not.toHaveBeenCalled();
  });
});

describe("retention integration guards", () => {
  const source = (file: string) => readFileSync(`${process.cwd()}/${file}`, "utf8");
  it("keeps expiry independent from deletion, CRM writes and email", () => {
    for (const file of ["src/lib/portal-access.ts", "src/lib/student-access-expiry.ts"]) {
      const text = source(file);
      expect(text).not.toMatch(/deleteUser\(|deletedAt:|sendEmail\(|sendInvitation\(|dispatchWebhook\(/);
    }
    expect(source("src/app/api/cron/student-access-expiry/route.ts")).toContain('eq(users.role, "student")');
  });
  it("keeps the existing assigned-coach authorization boundary", () => {
    const text = source("src/lib/coaching-student-access.ts");
    expect(text).toContain("canAccessCoachingStudent");
    expect(text).not.toContain("cmbPortalAccessStatus");
  });
  it("prevents status-only Clerk updates from syncing unchanged emails to GHL", () => {
    expect(source("src/app/api/webhooks/clerk/route.ts")).toContain("user.length > 0 && emailChanged");
  });
  it("has no student deletion action in the management UI", () => {
    const text = source("src/components/admin/UsersManageTable.tsx");
    expect(text).toContain("Expire access");
    expect(text).not.toContain("bulk-delete");
    expect(text).not.toContain("Remove from lab");
  });
});
