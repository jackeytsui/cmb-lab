import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CMB Lab announcements", () => {
  it("renders the active announcement in the shared dashboard layout", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const slot = source(
      "src/components/announcements/IgcAnnouncementSlot.tsx",
    );

    expect(layout).toContain("<IgcAnnouncementSlot");
    expect(layout).toContain("eq(announcements.isActive, true)");
    expect(layout).toContain("getIgcCoachingAnnouncement");
    expect(slot).toContain("<AnnouncementBanner");
    expect(slot).toContain('fetch("/api/coaching/announcement"');
    expect(slot).toContain("window.setInterval(refreshAnnouncement, 30_000)");
  });

  it("does not let individual users dismiss the global banner", () => {
    const banner = source(
      "src/components/announcements/AnnouncementBanner.tsx",
    );
    const manager = source("src/components/admin/AnnouncementManager.tsx");
    const globalStyles = source("src/app/globals.css");
    const coachingAnnouncement = source(
      "src/lib/group-coaching-announcement.ts",
    );

    expect(banner).toContain("CMB Lab announcement");
    expect(coachingAnnouncement).toContain("ICGC · Live now");
    expect(coachingAnnouncement).toContain('eq(tags.name, "icgc_student")');
    expect(coachingAnnouncement).toContain("linkUrl: event.meetingUrl");
    expect(banner).toContain('target={isExternalLink ? "_blank" : undefined}');
    expect(banner).toContain("announcement-gradient-copy");
    expect(manager).toContain("announcement-gradient-copy");
    expect(globalStyles).toContain(
      '[data-admin-theme="true"] .announcement-gradient-copy',
    );
    expect(banner).not.toContain("Dismiss");
    expect(banner).not.toContain("localStorage");
  });

  it("adds push and click handlers to the production service worker", () => {
    const serviceWorker = source("public/sw.js");

    expect(serviceWorker).toContain('addEventListener("push"');
    expect(serviceWorker).toContain('addEventListener("notificationclick"');
    expect(serviceWorker).toContain("showNotification");
  });

  it("supports role-and-tag targeted manual broadcasts", () => {
    const manager = source("src/components/admin/AnnouncementManager.tsx");
    const route = source("src/app/api/admin/announcements/route.ts");
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(manager).toContain("Specific people");
    expect(manager).toContain("audienceTagIds");
    expect(manager).toContain("selectedRoles");
    expect(route).toContain("i.audience_roles ? u.role::text");
    expect(route).toContain("i.audience_tag_ids ? st.tag_id::text");
    expect(layout).toContain("announcementMatchesAudience");
  });
});
