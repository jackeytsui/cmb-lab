import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("platform role source of truth", () => {
  it("contains no email-based platform role allowlist", () => {
    expect(
      existsSync(path.join(process.cwd(), "src/lib/access-control.ts")),
    ).toBe(false);

    const files = [
      "src/proxy.ts",
      "src/lib/auth.ts",
      "src/app/(dashboard)/layout.tsx",
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/app/api/webhooks/clerk/route.ts",
      "src/app/api/webhooks/enroll/route.ts",
      "src/app/api/webhooks/discord/route.ts",
      "src/components/layout/AppSidebar.tsx",
      "src/components/layout/NavUser.tsx",
    ];

    for (const file of files) {
      const contents = source(file);
      expect(contents).not.toContain("resolveRoleFromEmail");
      expect(contents).not.toContain("ADMIN_EMAILS");
      expect(contents).not.toContain("COACH_EMAILS");
    }
  });

  it("never rewrites an existing database role during dashboard navigation", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain("role: DEFAULT_PLATFORM_ROLE");
    expect(dashboard).not.toContain("dbUser.role !== role");
    expect(dashboard).not.toContain("db.update(users).set({ role })");
  });

  it("keeps Clerk profile webhooks from changing existing database roles", () => {
    const webhook = source("src/app/api/webhooks/clerk/route.ts");
    const updatedHandler = webhook.split('if (evt.type === "user.updated")')[1];

    expect(updatedHandler).toBeTruthy();
    expect(updatedHandler).not.toContain("role: effectiveRole");
    expect(updatedHandler).not.toContain("applyInvitationMetadataToUser");
  });

  it("synchronizes administrator role changes into Clerk metadata", () => {
    const adminRoute = source(
      "src/app/api/admin/students/[studentId]/route.ts",
    );

    expect(adminRoute).toContain("updateUserMetadata(student.clerkId");
    expect(adminRoute).toContain("role: parsed.data.role");
  });

  it("passes the database role into the client-side account menu", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const sidebar = source("src/components/layout/AppSidebar.tsx");
    const navUser = source("src/components/layout/NavUser.tsx");

    expect(layout).toContain("viewAsUser={viewAsUser}");
    expect(sidebar).toContain("<NavUser role={role} viewAsUser={viewAsUser} />");
    expect(navUser).toContain("viewAsUser?: ViewedUser | null");
    expect(navUser).toContain("viewAsUser?.email || signedInEmail");
    expect(navUser).toContain("Viewing as ${viewAsUser.name || viewAsUser.email}");
    expect(navUser).not.toContain("publicMetadata?.role");
  });
});
