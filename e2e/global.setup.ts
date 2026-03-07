import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

setup.describe.configure({ mode: "serial" });

const clerkDir = path.join(__dirname, "playwright", ".clerk");

setup("global setup", async () => {
  await clerkSetup();
});

setup("authenticate student", async ({ page }) => {
  fs.mkdirSync(clerkDir, { recursive: true });

  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_STUDENT_EMAIL!,
      password: process.env.E2E_CLERK_STUDENT_PASSWORD!,
    },
  });

  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  await page.context().storageState({
    path: path.join(clerkDir, "student.json"),
  });
});

setup("authenticate coach", async ({ page }) => {
  fs.mkdirSync(clerkDir, { recursive: true });

  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_COACH_EMAIL!,
      password: process.env.E2E_CLERK_COACH_PASSWORD!,
    },
  });

  await page.goto("/coach");
  await page.waitForLoadState("networkidle");

  await page.context().storageState({
    path: path.join(clerkDir, "coach.json"),
  });
});
