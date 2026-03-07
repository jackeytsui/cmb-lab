import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class LessonPage {
  readonly page: Page;
  readonly videoPlayer: Locator;
  readonly interactionArea: Locator;
  readonly submitButton: Locator;
  readonly chineseInput: Locator;
  readonly feedbackArea: Locator;
  readonly completionBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.videoPlayer = page.locator("mux-player");
    this.interactionArea = page.locator('[data-testid="interaction-area"]');
    this.submitButton = page.locator('[data-testid="submit-answer"]');
    this.chineseInput = page.locator('[data-testid="chinese-input"]');
    this.feedbackArea = page.locator('[data-testid="feedback"]');
    this.completionBadge = page.locator('[data-testid="lesson-complete"]');
  }

  async goto(lessonId: string): Promise<void> {
    await this.page.goto(`/lessons/${lessonId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async submitAnswer(text: string): Promise<void> {
    await this.chineseInput.fill(text);
    await this.submitButton.click();
  }

  async expectCompleted(): Promise<void> {
    await expect(this.completionBadge).toBeVisible();
  }

  async expectFeedbackVisible(): Promise<void> {
    await expect(this.feedbackArea).toBeVisible();
  }
}
