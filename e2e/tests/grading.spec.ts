import { test, expect } from "../fixtures/auth";
import { mockGradingResponse } from "../helpers/webhook-mock";
import { mockMuxPlayer } from "../helpers/mux-mock";
import { LessonPage } from "../pages/lesson.page";

/**
 * TEST-04: AI grading E2E tests with mocked n8n webhook response
 *
 * Tests the grading flow: student submits answer via [data-testid="submit-answer"],
 * grading API is intercepted with mockGradingResponse, and feedback is displayed
 * in [data-testid="feedback"].
 *
 * Uses data-testid selectors added in Task 1:
 * - chinese-input: text input for student response
 * - submit-answer: submit button
 * - feedback: feedback display container
 * - interaction-area: wrapper for the interaction section
 */

// Use a known lesson ID from seed data (or any valid route for mocked tests)
const TEST_LESSON_ID = "test-lesson-id";

test.describe("AI grading with mocked webhook", () => {
  test("displays feedback after submitting answer with mocked grading response", async ({
    studentPage,
  }) => {
    // Set up mocks before navigation
    await mockMuxPlayer(studentPage);
    await mockGradingResponse(studentPage, {
      isCorrect: true,
      score: 85,
      feedback: "Great pronunciation of the tones.",
      corrections: [],
    });

    // Navigate to lesson
    const lessonPage = new LessonPage(studentPage);
    await lessonPage.goto(TEST_LESSON_ID);

    // Find interaction area and input
    const interactionArea = studentPage.locator(
      '[data-testid="interaction-area"]',
    );
    const chineseInput = studentPage.locator('[data-testid="chinese-input"]');
    const submitButton = studentPage.locator('[data-testid="submit-answer"]');
    const feedbackArea = studentPage.locator('[data-testid="feedback"]');

    // Wait for interaction to be visible
    await expect(interactionArea).toBeVisible({ timeout: 10000 });

    // Type answer and submit
    await chineseInput.fill("你好");
    await submitButton.click();

    // Verify feedback appears with mocked content
    await expect(feedbackArea).toBeVisible({ timeout: 5000 });
    await expect(feedbackArea).toContainText(
      "Great pronunciation of the tones.",
    );
    await expect(feedbackArea).toContainText("Score: 85/100");
  });

  test("shows error message when grading API returns 500", async ({
    studentPage,
  }) => {
    // Set up mocks: Mux player mock + failing grading endpoint
    await mockMuxPlayer(studentPage);
    await studentPage.route("**/api/grade", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      }),
    );

    // Navigate to lesson
    const lessonPage = new LessonPage(studentPage);
    await lessonPage.goto(TEST_LESSON_ID);

    const interactionArea = studentPage.locator(
      '[data-testid="interaction-area"]',
    );
    const chineseInput = studentPage.locator('[data-testid="chinese-input"]');
    const submitButton = studentPage.locator('[data-testid="submit-answer"]');
    const feedbackArea = studentPage.locator('[data-testid="feedback"]');

    // Wait for interaction
    await expect(interactionArea).toBeVisible({ timeout: 10000 });

    // Type answer and submit
    await chineseInput.fill("错误");
    await submitButton.click();

    // Verify error feedback is displayed (not a crash/blank page)
    await expect(feedbackArea).toBeVisible({ timeout: 5000 });
    await expect(feedbackArea).toContainText("Failed to grade your response");
  });
});
