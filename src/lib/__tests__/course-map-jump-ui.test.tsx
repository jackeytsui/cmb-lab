// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole, waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MODULE_ID = "d2a44fbb-e4aa-48a9-8d22-e05f78056762";
const COURSE_ID = "a3a5a4bf-d8b3-47f1-a101-dbbec725cda0";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  jump: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/app/(dashboard)/dashboard/course-library/actions", () => ({
  jumpAheadToCourseLibraryModule: mocks.jump,
}));

import { CourseMap, type CourseMapStop } from "@/components/course-library/CourseMap";

const stops: CourseMapStop[] = [
  {
    id: "5d9e9230-ce9b-4605-aee6-dbf2c2b632ae",
    title: "Current stop",
    shortTitle: null,
    mapStyle: "lesson",
    weekLabel: "Week 1",
    lessonCount: 1,
    completedCount: 0,
    isComplete: false,
    isJumpUnlocked: false,
  },
  {
    id: MODULE_ID,
    title: "Grocery Store Shopping",
    shortTitle: null,
    mapStyle: "cm_school",
    weekLabel: "Week 4",
    lessonCount: 1,
    completedCount: 0,
    isComplete: false,
    isJumpUnlocked: false,
  },
];

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.jump.mockResolvedValue({
    success: true,
    href: `/course-library/${COURSE_ID}/modules/${MODULE_ID}`,
  });
});

afterEach(() => vi.unstubAllGlobals());

async function renderMap(
  initialJumpTargetId?: string,
  renderedStops: CourseMapStop[] = stops,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <CourseMap
        courseId={COURSE_ID}
        stops={renderedStops}
        currentIndex={0}
        initialJumpTargetId={initialJumpTargetId}
      />,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("Course Library student jump confirmation", () => {
  it("opens the requested locked stop after an explicit confirmation", async () => {
    const view = await renderMap();
    try {
      await act(async () => {
        fireEvent.click(
          getByRole(view.container, "button", {
            name: /Grocery Store Shopping \(ahead of your progress\)/,
          }),
        );
      });
      await act(async () => {
        fireEvent.click(
          getByRole(document.body, "button", { name: "Jump ahead" }),
        );
      });

      await waitFor(() => {
        expect(mocks.jump).toHaveBeenCalledWith(MODULE_ID);
        expect(mocks.push).toHaveBeenCalledWith(
          `/course-library/${COURSE_ID}/modules/${MODULE_ID}`,
        );
      });
    } finally {
      await view.unmount();
    }
  });

  it("auto-opens confirmation for a direct locked URL and keeps failures actionable", async () => {
    mocks.jump.mockResolvedValueOnce({
      success: false,
      error: "We could not open that stop. Please try again.",
    });
    const view = await renderMap(MODULE_ID);
    try {
      expect(getByRole(document.body, "alertdialog")).toBeTruthy();
      await act(async () => {
        fireEvent.click(
          getByRole(document.body, "button", { name: "Jump ahead" }),
        );
      });

      await waitFor(() => {
        expect(getByRole(document.body, "alert").textContent).toContain(
          "Please try again",
        );
      });
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it("renders a previously granted future stop as a normal link", async () => {
    const grantedStops = [stops[0], { ...stops[1], isJumpUnlocked: true }];
    const view = await renderMap(undefined, grantedStops);
    try {
      const unlocked = view.container.querySelector(
        `a[href="/course-library/${COURSE_ID}/modules/${MODULE_ID}"]`,
      );
      expect(unlocked).not.toBeNull();
      expect(queryByRole(document.body, "alertdialog")).toBeNull();
    } finally {
      await view.unmount();
    }
  });
});
