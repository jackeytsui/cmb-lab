import type { Locator, Page } from "@playwright/test";

export class CoachPage {
  readonly page: Page;
  readonly submissionQueue: Locator;
  readonly submissionCards: Locator;
  readonly feedbackInput: Locator;
  readonly sendFeedbackButton: Locator;
  readonly noteInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.submissionQueue = page.locator('[data-testid="submission-queue"]');
    this.submissionCards = page.locator('[data-testid="submission-card"]');
    this.feedbackInput = page.locator('[data-testid="feedback-input"]');
    this.sendFeedbackButton = page.locator('[data-testid="send-feedback"]');
    this.noteInput = page.locator('[data-testid="note-input"]');
  }

  async goto(): Promise<void> {
    await this.page.goto("/coach");
    await this.page.waitForLoadState("networkidle");
  }

  async getSubmissionCount(): Promise<number> {
    return this.submissionCards.count();
  }

  async openSubmission(index: number): Promise<void> {
    await this.submissionCards.nth(index).click();
  }

  async sendFeedback(text: string): Promise<void> {
    await this.feedbackInput.fill(text);
    await this.sendFeedbackButton.click();
  }

  async addNote(text: string): Promise<void> {
    await this.noteInput.fill(text);
  }
}
