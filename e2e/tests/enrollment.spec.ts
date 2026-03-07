import { test, expect } from "@playwright/test";

/**
 * TEST-02: Enrollment webhook E2E tests
 *
 * Tests the /api/webhooks/enroll endpoint that creates student accounts
 * with course access. This is an API-only test (no browser UI needed).
 *
 * The webhook expects:
 * - Header: x-webhook-secret matching ENROLLMENT_WEBHOOK_SECRET
 * - Body: { email, courseId, name?, accessTier?, expiresAt? }
 *
 * Responses:
 * - 200: { success: true, userId, courseId, accessTier }
 * - 401: { error: "Unauthorized" } for invalid secret
 * - 400: { error: "Missing required fields: email, courseId" }
 * - 404: { error: "Course not found" }
 */

const WEBHOOK_URL = "/api/webhooks/enroll";
const TEST_SECRET =
  process.env.ENROLLMENT_WEBHOOK_SECRET ?? "test-webhook-secret";

test.describe("Enrollment webhook", () => {
  test("creates student with course access on valid request", async ({
    request,
  }) => {
    const response = await request.post(WEBHOOK_URL, {
      headers: {
        "x-webhook-secret": TEST_SECRET,
        "Content-Type": "application/json",
      },
      data: {
        email: "e2e-test-student@example.com",
        name: "E2E Test Student",
        courseId: "test-course-id",
        accessTier: "full",
      },
    });

    // Webhook should return success
    expect(response.status()).toBeLessThanOrEqual(201);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.courseId).toBe("test-course-id");
    expect(body.accessTier).toBe("full");
    expect(body.userId).toBeDefined();
  });

  test("rejects request with invalid webhook secret", async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, {
      headers: {
        "x-webhook-secret": "wrong-secret-value",
        "Content-Type": "application/json",
      },
      data: {
        email: "unauthorized@example.com",
        name: "Unauthorized User",
        courseId: "test-course-id",
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 400 when required fields are missing", async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, {
      headers: {
        "x-webhook-secret": TEST_SECRET,
        "Content-Type": "application/json",
      },
      data: {
        // Missing email and courseId
        name: "Incomplete User",
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Missing required fields");
  });
});
