import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Roles } from "@/types/globals";
import { FEATURE_KEYS } from "@/lib/feature-definitions";

const { roleState } = vi.hoisted(() => ({ roleState: { role: "coach" as string } }));
vi.mock("@/lib/auth", () => ({
  hasMinimumRole: async () => roleState.role !== "student",
  checkRole: async (role: string) => roleState.role === role,
}));
vi.mock("@/components/admin/AdminManageGrid", () => ({
  AdminManageGrid: ({ sections }: { sections: unknown[] }) => <div>{JSON.stringify(sections)}</div>,
}));
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: () => null, SidebarRail: () => null, SidebarTrigger: () => null,
}));
vi.mock("@/components/layout/NavMain", () => ({
  NavMain: ({ sections }: { sections: unknown[] }) => <div>{JSON.stringify(sections)}</div>,
}));
vi.mock("@/components/layout/NavUser", () => ({ NavUser: () => null }));

import AdminManagePortalPage from "@/app/(dashboard)/admin/manage/page";
import { AppSidebar } from "@/components/layout/AppSidebar";

describe("coach content navigation", () => {
  it("shows coaches course editing and assignment submissions in the portal", async () => {
    roleState.role = "coach";
    const html = renderToStaticMarkup(await AdminManagePortalPage());
    for (const href of ["/admin/course-library", "/admin/content/assignment-submissions", "/admin/audio-course", "/admin/exercises"]) {
      expect(html).toContain(href);
    }
    for (const href of ["/admin/api-keys", "/admin/roles", "/admin/ghl", "/admin/announcements", "/admin/accelerator/typing", "/admin/accelerator-extra/tone-mastery"]) {
      expect(html).not.toContain(href);
    }
  });

  it("removes both Accelerator groups for coaches even with all feature grants", () => {
    const html = renderToStaticMarkup(<AppSidebar role="coach" enabledFeatures={[...FEATURE_KEYS]} />);
    expect(html).not.toContain("/dashboard/accelerator");
    expect(html).not.toContain("Mandarin Accelerator");
    expect(html).toContain("/dashboard/course-library");
    expect(html).toContain("/admin/course-library");
    expect(html).toContain("/admin/content/assignment-submissions");
  });

  it.each(["student", "admin"] as Roles[])("retains both groups for entitled %s accounts", (role) => {
    const html = renderToStaticMarkup(<AppSidebar role={role} enabledFeatures={[...FEATURE_KEYS]} />);
    expect(html).toContain("/dashboard/accelerator");
    expect(html).toContain("/dashboard/accelerator-extra/audio");
    expect(html).toContain("/dashboard/accelerator-extra/tone-mastery");
    expect(html).toContain("/dashboard/accelerator-extra/listening-training");
  });

  it("retains admin Accelerator management shortcuts", async () => {
    roleState.role = "admin";
    const html = renderToStaticMarkup(await AdminManagePortalPage());
    expect(html).toContain("/admin/accelerator/typing");
    expect(html).toContain("/admin/accelerator-extra/tone-mastery");
  });

  it.each(["operations", "consultant", "temp"])("does not add content controls for %s", async (role) => {
    roleState.role = role;
    const html = renderToStaticMarkup(await AdminManagePortalPage());
    expect(html).not.toContain("/admin/course-library");
    expect(html).not.toContain("/admin/content/assignment-submissions");
  });

  it("shows coach sidebar entry points without requiring student package tags", () => {
    const html = renderToStaticMarkup(<AppSidebar role="coach" enabledFeatures={[]} />);
    expect(html).toContain("/admin/manage");
    expect(html).toContain("/admin/course-library");
    expect(html).toContain("/admin/content/assignment-submissions");
  });

  it.each(["student", "operations", "consultant", "temp"] as Roles[])("hides coach content shortcuts from %s", (role) => {
    const html = renderToStaticMarkup(<AppSidebar role={role} enabledFeatures={[]} />);
    expect(html).not.toContain("/admin/course-library");
    expect(html).not.toContain("/admin/content/assignment-submissions");
  });
});
