import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("student route access", () => {
  it("allows assignment feedback instead of redirecting students to the reader", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf8",
    );

    expect(middleware).toContain('"/dashboard/assignment-feedback(.*)"');
  });
});
