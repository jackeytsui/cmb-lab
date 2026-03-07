import type { Page } from "@playwright/test";

/**
 * Intercepts text grading API calls and fulfills them with a mock response.
 *
 * @param page - Playwright Page instance
 * @param response - The grading response payload to return
 */
export async function mockGradingResponse(
  page: Page,
  response: Record<string, unknown>,
): Promise<void> {
  await page.route("**/api/grade", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }),
  );
}

/**
 * Intercepts audio grading API calls and fulfills them with a mock response.
 *
 * @param page - Playwright Page instance
 * @param response - The audio grading response payload to return
 */
export async function mockAudioGradingResponse(
  page: Page,
  response: Record<string, unknown>,
): Promise<void> {
  await page.route("**/api/grade-audio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }),
  );
}

/**
 * Intercepts coach feedback notification API calls and fulfills them
 * with a success response.
 *
 * @param page - Playwright Page instance
 */
export async function mockCoachFeedbackNotification(
  page: Page,
): Promise<void> {
  await page.route("**/api/notify/coach-feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    }),
  );
}
