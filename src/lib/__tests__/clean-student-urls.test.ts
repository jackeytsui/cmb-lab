import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import {
  CLEAN_STUDENT_EXACT_ROUTES,
  CLEAN_STUDENT_ROUTE_PREFIXES,
  getStudentRouteRedirects,
  getStudentRouteRewrites,
} from "@/lib/student-route-aliases";

describe("clean student URLs", () => {
  it("makes clean URLs canonical without removing legacy dashboard routes", async () => {
    expect(await nextConfig.redirects?.()).toEqual(getStudentRouteRedirects());

    const configuredRewrites = await nextConfig.rewrites?.();
    expect(Array.isArray(configuredRewrites)).toBe(false);
    if (!configuredRewrites || Array.isArray(configuredRewrites)) return;

    expect(configuredRewrites.afterFiles).toEqual(getStudentRouteRewrites());
  });

  it("covers every student dashboard route prefix", () => {
    expect(CLEAN_STUDENT_ROUTE_PREFIXES).toEqual([
      "accelerator-extra",
      "accelerator",
      "assessments",
      "assignment-feedback",
      "audio-courses",
      "coaching",
      "course-library",
      "flashcards",
      "grammar",
      "listening",
      "notepad",
      "progress",
      "reader",
      "srs",
      "threads",
      "tone",
      "vocabulary",
    ]);
  });

  it("keeps the practice landing alias exact so practice attempts still use /practice/[setId]", () => {
    expect(CLEAN_STUDENT_EXACT_ROUTES).toContainEqual({
      clean: "/practice",
      legacy: "/dashboard/practice",
    });
    expect(getStudentRouteRewrites()).not.toContainEqual({
      source: "/practice/:path*",
      destination: "/dashboard/practice/:path*",
    });
  });

  it("separates route indexes from nested paths so empty params never reach dynamic pages", () => {
    const redirects = getStudentRouteRedirects();
    const rewrites = getStudentRouteRewrites();

    expect(redirects).toHaveLength(
      CLEAN_STUDENT_EXACT_ROUTES.length + CLEAN_STUDENT_ROUTE_PREFIXES.length * 2,
    );
    expect(rewrites).toHaveLength(
      CLEAN_STUDENT_EXACT_ROUTES.length + CLEAN_STUDENT_ROUTE_PREFIXES.length * 2,
    );

    for (const prefix of CLEAN_STUDENT_ROUTE_PREFIXES) {
      expect(redirects).toContainEqual({
        source: `/dashboard/${prefix}`,
        destination: `/${prefix}`,
        permanent: true,
      });
      expect(redirects).toContainEqual({
        source: `/dashboard/${prefix}/:path+`,
        destination: `/${prefix}/:path+`,
        permanent: true,
      });
      expect(rewrites).toContainEqual({
        source: `/${prefix}`,
        destination: `/dashboard/${prefix}`,
      });
      expect(rewrites).toContainEqual({
        source: `/${prefix}/:path+`,
        destination: `/dashboard/${prefix}/:path+`,
      });
    }

    expect(
      [...redirects, ...rewrites].some(
        ({ source, destination }) =>
          source.includes(":path*") || destination.includes(":path*"),
      ),
    ).toBe(false);
  });

  it("uses clean URLs in the shared student navigation", () => {
    const sidebar = readFileSync("src/components/layout/AppSidebar.tsx", "utf8");
    const navMain = readFileSync("src/components/layout/NavMain.tsx", "utf8");

    expect(sidebar).toContain('url: "/home"');
    expect(sidebar).toContain('url: "/reader/mandarin"');
    expect(sidebar).not.toContain('url: "/dashboard');
    expect(navMain).toContain('url === "/home"');
    expect(navMain).toContain('pathname === "/home"');
  });
});
