import { test, expect } from "../fixtures/auth";
import { typeChineseText } from "../helpers/composition";
import { mockMuxPlayer } from "../helpers/mux-mock";
import { mockGradingResponse } from "../helpers/webhook-mock";
import { LessonPage } from "../pages/lesson.page";

/**
 * TEST-06: Chinese IME composition E2E tests
 *
 * Tests that Chinese text input works correctly with IME composition events.
 * Uses the typeChineseText helper to simulate the compositionstart ->
 * compositionupdate(s) -> compositionend lifecycle that real IME input produces.
 *
 * Uses data-testid selectors:
 * - chinese-input: the IMEInput component
 * - submit-answer: the submit button
 * - interaction-area: interaction wrapper
 * - feedback: feedback display
 */

const TEST_LESSON_ID = "test-lesson-id";

test.describe("Chinese IME input", () => {
  test("accepts Chinese text via IME composition events", async ({
    studentPage,
  }) => {
    // Set up mocks
    await mockMuxPlayer(studentPage);
    await mockGradingResponse(studentPage, {
      isCorrect: true,
      score: 90,
      feedback: "Well done!",
      corrections: [],
    });

    // Navigate to lesson
    const lessonPage = new LessonPage(studentPage);
    await lessonPage.goto(TEST_LESSON_ID);

    // Wait for interaction to be ready
    const interactionArea = studentPage.locator(
      '[data-testid="interaction-area"]',
    );
    await expect(interactionArea).toBeVisible({ timeout: 10000 });

    // Simulate Chinese IME input for "你好" (nihao)
    await typeChineseText(
      studentPage,
      '[data-testid="chinese-input"]',
      "你好",
      ["n", "ni", "你", "你h", "你ha", "你hao", "你好"],
    );

    // Verify the input contains the final Chinese text
    const chineseInput = studentPage.locator('[data-testid="chinese-input"]');
    await expect(chineseInput).toHaveValue("你好");

    // Submit the answer to verify the form works end-to-end
    const submitButton = studentPage.locator('[data-testid="submit-answer"]');
    await submitButton.click();

    // Verify feedback appears (form submitted successfully with Chinese text)
    const feedbackArea = studentPage.locator('[data-testid="feedback"]');
    await expect(feedbackArea).toBeVisible({ timeout: 5000 });
    await expect(feedbackArea).toContainText("Well done!");
  });

  test("does not submit prematurely during IME composition", async ({
    studentPage,
  }) => {
    // Set up mocks
    await mockMuxPlayer(studentPage);
    await mockGradingResponse(studentPage, {
      isCorrect: true,
      score: 95,
      feedback: "Perfect!",
      corrections: [],
    });

    // Navigate to lesson
    const lessonPage = new LessonPage(studentPage);
    await lessonPage.goto(TEST_LESSON_ID);

    const interactionArea = studentPage.locator(
      '[data-testid="interaction-area"]',
    );
    await expect(interactionArea).toBeVisible({ timeout: 10000 });

    const chineseInput = studentPage.locator('[data-testid="chinese-input"]');
    const feedbackArea = studentPage.locator('[data-testid="feedback"]');

    // Start composition but do NOT end it
    await chineseInput.click();
    await chineseInput.evaluate((el: HTMLInputElement) => {
      el.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });

    // Send intermediate composition updates (simulating typing "ni")
    for (const step of ["n", "ni"]) {
      await chineseInput.evaluate(
        (el: HTMLInputElement, data: string) => {
          el.dispatchEvent(
            new CompositionEvent("compositionupdate", {
              bubbles: true,
              data,
            }),
          );
          el.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data,
              isComposing: true,
              inputType: "insertCompositionText",
            }),
          );
        },
        step,
      );
    }

    // During composition, feedback should NOT be visible (no premature submit)
    await expect(feedbackArea).not.toBeVisible();

    // Now complete the composition
    await chineseInput.evaluate((el: HTMLInputElement) => {
      const finalText = "你";
      el.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: finalText,
        }),
      );

      // Set value using native setter
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, finalText);
      } else {
        el.value = finalText;
      }

      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: finalText,
          isComposing: false,
          inputType: "insertCompositionText",
        }),
      );
    });

    // After composition ends, the input should have the final value
    await expect(chineseInput).toHaveValue("你");

    // Feedback should still NOT be visible (user hasn't clicked submit)
    await expect(feedbackArea).not.toBeVisible();
  });
});
