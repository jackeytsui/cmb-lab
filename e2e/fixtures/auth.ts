import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import path from "node:path";

const clerkDir = path.join(__dirname, "..", "playwright", ".clerk");

type AuthFixtures = {
  studentPage: Page;
  coachPage: Page;
};

export const test = base.extend<AuthFixtures>({
  studentPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(clerkDir, "student.json"),
    });
    const page = await context.newPage();
    // Playwright fixture API, not a React hook
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await context.close();
  },

  coachPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(clerkDir, "coach.json"),
    });
    const page = await context.newPage();
    // Playwright fixture API, not a React hook
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await context.close();
  },
});

export { expect };
