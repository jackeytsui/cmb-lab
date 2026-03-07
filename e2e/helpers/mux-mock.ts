import type { Page } from "@playwright/test";

/**
 * Mocks Mux video player network requests so tests do not depend on
 * real video streaming infrastructure.
 *
 * Blocks stream requests entirely and returns a tiny transparent PNG
 * for poster/thumbnail images.
 *
 * @returns A cleanup function that removes the route handlers.
 */
export async function mockMuxPlayer(
  page: Page,
): Promise<() => Promise<void>> {
  // 1x1 transparent PNG as base64
  const placeholderPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
      "Nl7BcQAAAABJRU5ErkJggg==",
    "base64",
  );

  await page.route("**/stream.mux.com/**", (route) => route.abort());

  await page.route("**/image.mux.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: placeholderPng,
    }),
  );

  return async () => {
    await page.unroute("**/stream.mux.com/**");
    await page.unroute("**/image.mux.com/**");
  };
}

/**
 * Simulates video watch progress by calling the progress API endpoint
 * directly. This avoids the need to interact with the mux-player
 * shadow DOM (which is fragile and browser-dependent).
 *
 * @param page - Playwright Page instance
 * @param lessonId - The lesson ID to report progress for
 * @param progressPercent - Percentage of video watched (0-100)
 */
export async function simulateVideoProgress(
  page: Page,
  lessonId: string,
  progressPercent: number,
): Promise<void> {
  await page.request.post("/api/progress", {
    data: {
      lessonId,
      progressPercent,
    },
  });
}
