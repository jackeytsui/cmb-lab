import type { Locator, Page } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly courseGrid: Locator;
  readonly courseCards: Locator;
  readonly progressBars: Locator;

  constructor(page: Page) {
    this.page = page;
    this.courseGrid = page.locator('[data-testid="course-grid"]');
    this.courseCards = page.locator('[data-testid="course-card"]');
    this.progressBars = page.locator('[data-testid="progress-bar"]');
  }

  async goto(): Promise<void> {
    await this.page.goto("/dashboard");
    await this.page.waitForLoadState("networkidle");
  }

  async getCourseCount(): Promise<number> {
    return this.courseCards.count();
  }

  async clickCourse(index: number): Promise<void> {
    await this.courseCards.nth(index).click();
  }
}
