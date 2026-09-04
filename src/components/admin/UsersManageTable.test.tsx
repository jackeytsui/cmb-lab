// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UsersManageTable } from "./UsersManageTable";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function table() {
  return render(<UsersManageTable items={[{
    id: "dan", name: "Dan Luong", email: "dan@example.test", role: "student",
    createdAt: "2026-01-01", portalAccessStatus: "active", tagIds: [],
  }]} total={1} page={1} pageSize={50} coaches={[]} allTags={[]} usersRoleFilter="student"
    showAssignedCoachColumn={false} baseQueryString="" />);
}

it("offers Expire access and submits only a status change, never a deletion", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ updatedCount: 1, failedCount: 0 }) });
  table();
  fireEvent.click(screen.getByLabelText("Select all on page"));
  expect(screen.queryByText("Remove from lab")).toBeNull();
  fireEvent.click(screen.getByText("Expire access"));
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("expired");
  expect(screen.getByText(/remain available to admins and assigned coaches/)).toBeTruthy();
  fireEvent.click(screen.getByText("Apply"));
  await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/students/bulk-portal-access", expect.objectContaining({
    method: "POST", body: JSON.stringify({ userIds: ["dan"], status: "expired" }),
  }));
});

it("keeps a partial failure visible instead of clearing it as success", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ updatedCount: 0, failedCount: 1 }) });
  table();
  fireEvent.click(screen.getByLabelText("Select all on page"));
  fireEvent.click(screen.getByText("Expire access"));
  fireEvent.click(screen.getByText("Apply"));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(screen.getByText(/1 failed — please retry/)).toBeTruthy();
  expect(mocks.success).not.toHaveBeenCalled();
});
