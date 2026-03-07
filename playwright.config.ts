import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      testDir: "./e2e",
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/playwright/.clerk/student.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: "e2e/playwright/.clerk/student.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        storageState: "e2e/playwright/.clerk/student.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "coach-chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/playwright/.clerk/coach.json",
      },
      testMatch: /coach\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
