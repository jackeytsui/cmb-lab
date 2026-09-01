import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const analyticsRoutes = [
  "overview",
  "completion",
  "dropoff",
  "students",
  "difficulty",
];

describe("admin analytics route exports", () => {
  it("keeps shared data helpers outside Next.js route modules", () => {
    for (const route of analyticsRoutes) {
      const source = readFileSync(
        `src/app/api/admin/analytics/${route}/route.ts`,
        "utf8",
      );
      const namedExports = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)]
        .map((match) => match[1]);

      expect(namedExports, route).toEqual(["GET"]);
      expect(source, route).toContain(
        'from "@/lib/admin-analytics-data"',
      );
    }

    const exportRoute = readFileSync(
      "src/app/api/admin/analytics/export/route.ts",
      "utf8",
    );
    expect(exportRoute).toContain('from "@/lib/admin-analytics-data"');
    expect(exportRoute).not.toMatch(/from "\.\.\/(?:overview|completion|dropoff|students|difficulty)\/route"/);
  });
});
