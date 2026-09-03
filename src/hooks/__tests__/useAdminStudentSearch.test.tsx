// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminStudentSearch } from "@/hooks/useAdminStudentSearch";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAdminStudentSearch", () => {
  it("searches the server by full email instead of filtering a local page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          students: [
            {
              id: "502411b7-6e4b-4f45-a59c-907ff78ed62c",
              name: "Kevin Ng",
              email: "kn645dds@gmail.com",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAdminStudentSearch("kn645dds@gmail.com", 10),
    );

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.email).toBe("kn645dds@gmail.com");

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    const url = new URL(requestedUrl, "https://cmb-lab.thecmblueprint.com");
    expect(url.pathname).toBe("/api/admin/students");
    expect(url.searchParams.get("search")).toBe("kn645dds@gmail.com");
    expect(url.searchParams.get("pageSize")).toBe("10");
  });

  it("does not request the directory for an empty search", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAdminStudentSearch("   "));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });
});
