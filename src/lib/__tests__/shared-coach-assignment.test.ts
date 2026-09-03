import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { coachAssignmentChangeSchema, coachAssignmentUpdate } from "@/lib/coach-assignment-change";
import { studentAssignedToCoach } from "@/lib/coach-student-sql";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), role: vi.fn(), findCoach: vi.fn(), update: vi.fn(),
  set: vi.fn(), where: vi.fn(), returning: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth", () => ({ hasMinimumRole: mocks.role }));
vi.mock("@/db", () => ({ db: { query: { users: { findFirst: mocks.findCoach } }, update: mocks.update } }));
import { PATCH } from "@/app/api/admin/students/[studentId]/coach/route";
import { POST } from "@/app/api/admin/students/bulk-assign-coach/route";

const studentId = "10000000-0000-4000-8000-000000000001";
const jane = "10000000-0000-4000-8000-000000000002";
const tiffany = "10000000-0000-4000-8000-000000000003";
const dialect = new PgDialect();
function patch(body: unknown, id = studentId) {
  return PATCH(new NextRequest("https://example.test/api/coach", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ studentId: id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin-clerk-id" });
  mocks.role.mockResolvedValue(true);
  mocks.findCoach.mockResolvedValue({ id: tiffany, role: "coach" });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: studentId, assignedCoachId: jane, additionalCoachIds: [tiffany] }]);
});

describe("shared coach assignment API", () => {
  it("adds a shared coach without replacing the primary or a stale shared list", async () => {
    const response = await patch({ addCoachId: tiffany });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ assignedCoachId: jane, additionalCoachIds: [tiffany] });
    expect(mocks.role).toHaveBeenCalledWith("admin");
    const change = mocks.set.mock.calls[0][0];
    expect(change).not.toHaveProperty("assignedCoachId");
    const query = dialect.sqlToQuery(change.additionalCoachIds);
    expect(query.sql).toContain("array_append");
    expect(query.sql).toContain("ANY");
    expect(query.params).toEqual([tiffany, tiffany, tiffany]);
    expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([studentId, "student"]);
  });

  it("removes only the specified shared coach, even if that coach is no longer active", async () => {
    const response = await patch({ removeCoachId: tiffany });
    expect(response.status).toBe(200);
    expect(mocks.findCoach).not.toHaveBeenCalled();
    const change = mocks.set.mock.calls[0][0];
    expect(change).not.toHaveProperty("assignedCoachId");
    expect(dialect.sqlToQuery(change.additionalCoachIds).sql).toContain("array_remove");
  });

  it("preserves additional coaches when clearing the primary", async () => {
    expect((await patch({ coachId: null })).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({ assignedCoachId: null });
  });

  it.each([{}, { addCoachId: "bad" }, { addCoachId: tiffany, coachId: jane }, { additionalCoachIds: [tiffany] }, null])("rejects malformed or ambiguous changes: %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects invalid student IDs", async () => {
    expect((await patch({ addCoachId: tiffany }, "bad")).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects missing, deleted, or non-coach choices", async () => {
    mocks.findCoach.mockResolvedValue(null);
    expect((await patch({ addCoachId: tiffany })).status).toBe(400);
    const coachLookup = dialect.sqlToQuery(mocks.findCoach.mock.calls[0][0].where);
    expect(coachLookup.sql).toContain('"users"."deleted_at" is null');
    mocks.findCoach.mockResolvedValue({ id: tiffany, role: "student" });
    expect((await patch({ addCoachId: tiffany })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not grant access to a nonexistent, deleted, or non-student target", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await patch({ addCoachId: tiffany })).status).toBe(404);
    expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql).toContain('"users"."deleted_at" is null');
  });

  it("denies unauthenticated requests and non-admins for single and bulk assignments", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await patch({ addCoachId: tiffany })).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "coach-clerk-id" });
    mocks.role.mockResolvedValue(false);
    expect((await patch({ addCoachId: tiffany })).status).toBe(403);
    const response = await POST(new NextRequest("https://example.test/api/bulk", { method: "POST", body: JSON.stringify({ studentIds: [studentId], coachId: jane }) }));
    expect(response.status).toBe(403);
    expect(mocks.role.mock.calls.every(([role]) => role === "admin")).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("shared coach query semantics", () => {
  it("filters by primary OR shared membership using bound parameters", () => {
    const query = dialect.sqlToQuery(studentAssignedToCoach(tiffany));
    expect(query.sql).toContain('"users"."assigned_coach_id" =');
    expect(query.sql).toContain('or "users"."additional_coach_ids" @>');
    expect(query.params).toEqual([tiffany, `{"${tiffany}"}`]);
  });
  it("promotes a shared coach without duplicates and preserves others", () => {
    const change = coachAssignmentUpdate({ coachId: tiffany });
    expect(change).toHaveProperty("assignedCoachId", tiffany);
    expect(dialect.sqlToQuery(change.additionalCoachIds!).sql).toContain("array_remove");
    expect(coachAssignmentChangeSchema.safeParse({ coachId: null }).success).toBe(true);
  });
});
