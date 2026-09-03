// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssignCoachDropdown } from "../AssignCoachDropdown";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const props = {
  studentId: "student", currentCoachId: "jane", currentCoachName: "Jane",
  coaches: [{ id: "jane", name: "Jane", email: "jane@example.test" }, { id: "tiffany", name: "Tiffany", email: "tiffany@example.test" }],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("shared coach controls", () => {
  it("adds Tiffany without replacing Jane, then allows removing only Tiffany", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ assignedCoachId: "jane", additionalCoachIds: ["tiffany"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignedCoachId: "jane", additionalCoachIds: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssignCoachDropdown {...props} />);
    fireEvent.change(screen.getByLabelText("Add an additional coach"), { target: { value: "tiffany" } });
    fireEvent.click(screen.getByRole("button", { name: "Add coach" }));
    await screen.findByRole("button", { name: "Remove Tiffany" });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ addCoachId: "tiffany" }));
    expect((screen.getByLabelText("Primary coach") as HTMLSelectElement).value).toBe("jane");
    fireEvent.click(screen.getByRole("button", { name: "Remove Tiffany" }));
    await screen.findByText("No additional coaches assigned.");
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ removeCoachId: "tiffany" }));
    expect((screen.getByLabelText("Primary coach") as HTMLSelectElement).value).toBe("jane");
  });

  it("does not make a silent assignment change or lose current coaches on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Please try again" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssignCoachDropdown {...props} additionalCoachIds={["tiffany"]} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove Tiffany" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Remove Tiffany" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("requires saving an intentional primary-coach change", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ assignedCoachId: "tiffany", additionalCoachIds: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssignCoachDropdown {...props} />);
    fireEvent.change(screen.getByLabelText("Primary coach"), { target: { value: "tiffany" } });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save primary coach" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ coachId: "tiffany" }));
  });
});
