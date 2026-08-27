// @vitest-environment happy-dom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseLibraryListClient } from "@/app/(dashboard)/admin/course-library/CourseLibraryListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const courses = [
  {
    id: "cantonese",
    title: "Confident Cantonese Kickstarter",
    summary: "Everyday speaking practice for beginners",
    coverImageUrl: null,
    isPublished: true,
    status: "published" as const,
    sortOrder: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "mandarin",
    title: "Mandarin for Children",
    summary: "Games and family-friendly vocabulary",
    coverImageUrl: null,
    isPublished: false,
    status: "draft" as const,
    sortOrder: 2,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
];

afterEach(cleanup);

describe("admin Course Library search UI", () => {
  it("filters course cards while typing without submitting", async () => {
    render(<CourseLibraryListClient initialCourses={courses} />);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search courses by title or description",
      }),
      { target: { value: "family-friendly" } },
    );

    await waitFor(() => {
      expect(screen.getByText("1 of 2 courses")).toBeTruthy();
      expect(screen.getByText("Mandarin for Children")).toBeTruthy();
      expect(
        screen.queryByText("Confident Cantonese Kickstarter"),
      ).toBeNull();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Clear course search" }),
    );

    await waitFor(() => {
      expect(screen.getByText("2 courses")).toBeTruthy();
      expect(screen.getByText("Confident Cantonese Kickstarter")).toBeTruthy();
    });
  });
});
