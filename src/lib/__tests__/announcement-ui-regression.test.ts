import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CMB Lab announcements", () => {
  it("renders the active announcement in the shared dashboard layout", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(layout).toContain("<AnnouncementBanner");
    expect(layout).toContain("eq(announcements.isActive, true)");
  });

  it("does not let individual users dismiss the global banner", () => {
    const banner = source(
      "src/components/announcements/AnnouncementBanner.tsx",
    );

    expect(banner).toContain("CMB Lab announcement");
    expect(banner).not.toContain("Dismiss");
    expect(banner).not.toContain("localStorage");
  });

  it("adds push and click handlers to the production service worker", () => {
    const serviceWorker = source("public/sw.js");

    expect(serviceWorker).toContain('addEventListener("push"');
    expect(serviceWorker).toContain('addEventListener("notificationclick"');
    expect(serviceWorker).toContain("showNotification");
  });
});
