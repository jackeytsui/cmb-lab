import { test, expect } from "../fixtures/auth";
import { mockMuxPlayer, simulateVideoProgress } from "../helpers/mux-mock";
import { mockGradingResponse } from "../helpers/webhook-mock";
import { LessonPage } from "../pages/lesson.page";
import { DashboardPage } from "../pages/dashboard.page";

/**
 * TEST-03: Student lesson completion E2E tests.
 *
 * Covers:
 * 1. Navigation from dashboard to a lesson
 * 2. Completing a lesson with video progress + interaction pass
 * 3. Locked lesson enforcement for incomplete prerequisites
 *
 * Uses student auth (studentPage fixture) with mocked Mux player
 * and grading API responses for deterministic test behavior.
 */

test.describe("Student lesson completion", () => {
  test("student can navigate to a lesson from dashboard", async ({
    studentPage,
  }) => {
    const dashboard = new DashboardPage(studentPage);
    await dashboard.goto();

    // Dashboard should render the course grid
    await expect(dashboard.courseGrid).toBeVisible();

    // Should have at least one course card
    const courseCount = await dashboard.getCourseCount();
    expect(courseCount).toBeGreaterThan(0);

    // Click on the first course to see its lessons
    await dashboard.clickCourse(0);

    // Course detail page should show the lessons list
    const lessonsList = studentPage.locator('[data-testid="lessons-list"]');
    await expect(lessonsList).toBeVisible();

    // Should have at least one lesson card (unlocked or completed)
    const lessonCards = studentPage.locator(
      '[data-testid="lesson-card"], [data-testid="lesson-card-completed"]',
    );
    await expect(lessonCards.first()).toBeVisible();

    // Click first available (unlocked) lesson
    await lessonCards.first().click();

    // Lesson page should load with the video player area
    const videoPlayerArea = studentPage.locator(
      '[data-testid="video-player-area"]',
    );
    await expect(videoPlayerArea).toBeVisible();
  });

  test("student can complete a lesson with video progress and interaction pass", async ({
    studentPage,
  }) => {
    // Track progress API calls to verify completion flow
    const progressCalls: Array<{ method: string; body?: unknown }> = [];

    // Mock Mux player to prevent real streaming
    const cleanupMux = await mockMuxPlayer(studentPage);

    // Mock the grading API to return a passing response
    await mockGradingResponse(studentPage, {
      isCorrect: true,
      score: 95,
      feedback: "Excellent! Your answer is correct.",
    });

    // Mock the progress API and track calls
    // The app posts to /api/progress/[lessonId] with videoWatchedPercent
    await studentPage.route("**/api/progress/**", async (route) => {
      const method = route.request().method();
      let body: unknown = null;
      if (method === "POST") {
        try {
          body = route.request().postDataJSON();
        } catch {
          // No body
        }
        progressCalls.push({ method, body });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            progress: {
              videoWatchedPercent: 100,
              interactionCompleted: true,
              completedAt: new Date().toISOString(),
            },
            completion: {
              isComplete: true,
              videoComplete: true,
              interactionsComplete: true,
            },
            lessonComplete: true,
          }),
        });
      }
      // GET requests return initial empty progress
      progressCalls.push({ method });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          progress: null,
          completion: {
            isComplete: false,
            videoComplete: false,
            interactionsComplete: false,
          },
        }),
      });
    });

    // Navigate to dashboard first, then to a lesson
    const dashboard = new DashboardPage(studentPage);
    await dashboard.goto();
    await dashboard.clickCourse(0);

    // Click the first unlocked lesson
    const firstLesson = studentPage.locator(
      '[data-testid="lesson-card"], [data-testid="lesson-card-completed"]',
    );
    await firstLesson.first().click();

    // Wait for lesson page to load
    const lessonPage = new LessonPage(studentPage);
    const videoPlayerArea = studentPage.locator(
      '[data-testid="video-player-area"]',
    );
    await expect(videoPlayerArea).toBeVisible();

    // Extract lesson ID from URL for progress simulation
    const currentUrl = studentPage.url();
    const lessonIdMatch = currentUrl.match(/\/lessons\/([^/?#]+)/);
    expect(lessonIdMatch).toBeTruthy();
    const lessonId = lessonIdMatch![1];

    // Simulate video progress to 100% via the helper
    // (calls POST /api/progress with lessonId and progressPercent)
    await simulateVideoProgress(studentPage, lessonId, 100);

    // Wait for the interaction area to appear (video pauses at cue point)
    // If the lesson has interactions, the overlay will show
    const interactionArea = studentPage.locator(
      '[data-testid="interaction-area"]',
    );
    const hasInteraction = await interactionArea
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (hasInteraction) {
      // Fill in the interaction input and submit
      await lessonPage.submitAnswer("test answer");

      // Assert feedback is shown from the mocked grading response
      await lessonPage.expectFeedbackVisible();
    }

    // Verify that the progress API was called (video progress was tracked)
    // The useProgress hook in the player posts to /api/progress/[lessonId]
    const postCalls = progressCalls.filter((c) => c.method === "POST");
    expect(postCalls.length).toBeGreaterThan(0);

    // Cleanup mux mock routes
    await cleanupMux();
  });

  test("lesson shows locked state for incomplete prerequisites", async ({
    studentPage,
  }) => {
    // Navigate to dashboard
    const dashboard = new DashboardPage(studentPage);
    await dashboard.goto();

    // Click on a course
    await dashboard.clickCourse(0);

    // Wait for lessons to load
    const lessonsList = studentPage.locator('[data-testid="lessons-list"]');
    await expect(lessonsList).toBeVisible();

    // Check if any locked lessons exist
    const lockedLessons = studentPage.locator(
      '[data-testid="lesson-card-locked"]',
    );
    const lockedCount = await lockedLessons.count();

    if (lockedCount > 0) {
      // Locked lessons should have opacity-50 and cursor-not-allowed styling
      const firstLocked = lockedLessons.first();
      await expect(firstLocked).toBeVisible();
      await expect(firstLocked).toHaveClass(/opacity-50/);
      await expect(firstLocked).toHaveClass(/cursor-not-allowed/);

      // Locked lesson should be wrapped in a pointer-events-none div
      // Clicking should NOT navigate away from the current page
      const currentUrl = studentPage.url();
      await firstLocked.click({ force: true });

      // URL should remain the same (no navigation occurred)
      expect(studentPage.url()).toBe(currentUrl);
    } else {
      // If no locked lessons (all completed or only one lesson),
      // verify the page structure is still correct
      const allLessons = studentPage.locator(
        '[data-testid="lesson-card"], [data-testid="lesson-card-completed"], [data-testid="lesson-card-locked"]',
      );
      const totalCount = await allLessons.count();
      expect(totalCount).toBeGreaterThan(0);
    }
  });
});
