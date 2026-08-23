import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("CMB Lab Assistant availability and layout", () => {
  it("renders for every active signed-in dashboard user without a feature gate", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(layout).toContain("<LabAssistantWidget />");
    expect(layout).not.toContain("showLabAssistant &&");
  });

  it("keeps the conversation as the only flexible scroll region", () => {
    const panel = source(
      "src/components/lab-assistant/LabAssistantPanel.tsx",
    );

    expect(panel).toContain("min-h-0 flex-1");
    expect(panel).toContain("overflow-y-auto overscroll-contain");
    expect(panel).not.toContain("FAQ chips pinned at top");
  });

  it("uses dynamic viewport sizing and hides the duplicate launcher while open", () => {
    const widget = source(
      "src/components/lab-assistant/LabAssistantWidget.tsx",
    );

    expect(widget).toContain("h-[calc(100dvh-1rem)]");
    expect(widget).toContain("pointer-events-none scale-75 opacity-0");
  });

  it("keeps the composer footer uncluttered", () => {
    const panel = source(
      "src/components/lab-assistant/LabAssistantPanel.tsx",
    );

    expect(panel).not.toContain("Enter to send · Shift + Enter");
    expect(panel).not.toContain("Contact a person");
    expect(panel).not.toContain("mt-2 flex items-center justify-between gap-3");
  });
});
