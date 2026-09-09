import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("Clerk content security policy", () => {
  it("allows the production Clerk custom domain for scripts and API calls", async () => {
    const headerRules = await nextConfig.headers?.();
    const appHeaders = headerRules?.find(
      (rule) => rule.source === "/((?!api/accelerator/file).*)",
    );
    const contentSecurityPolicy = appHeaders?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    const directives = new Map(
      contentSecurityPolicy
        ?.split(";")
        .map((directive) => directive.trim().split(/\s+/))
        .filter(([name]) => Boolean(name))
        .map(([name, ...sources]) => [name, sources]),
    );

    expect(directives.get("script-src")).toContain(
      "https://clerk.thecmblueprint.com",
    );
    expect(directives.get("connect-src")).toContain(
      "https://clerk.thecmblueprint.com",
    );
  });
});
