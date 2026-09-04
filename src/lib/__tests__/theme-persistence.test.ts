// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

function runThemeBootstrap() {
  Function(THEME_BOOTSTRAP_SCRIPT)();
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("theme persistence", () => {
  it("runs the saved-theme bootstrap from the root document before hydration", () => {
    const rootLayout = readFileSync("src/app/layout.tsx", "utf8");

    expect(rootLayout).toContain("<head>");
    expect(rootLayout).toContain("THEME_BOOTSTRAP_SCRIPT");
    expect(rootLayout).toContain("suppressHydrationWarning");
  });

  it("restores dark mode before the application hydrates", () => {
    window.localStorage.setItem("theme", "dark");

    runThemeBootstrap();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps light mode for missing or unsupported stored values", () => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("theme", "unsupported");

    runThemeBootstrap();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
