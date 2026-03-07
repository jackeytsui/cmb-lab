import { test, expect } from "../fixtures/auth";
import { mockCoachFeedbackNotification } from "../helpers/webhook-mock";
import { CoachPage } from "../pages/coach.page";

/**
 * TEST-05: Coach review workflow E2E tests.
 *
 * Covers:
 * 1. Coach can see the submission queue on the coach dashboard
 * 2. Coach can review a submission and send feedback
 * 3. Coach can add notes to a submission
 *
 * Uses coach auth (coachPage fixture) via the coach-chromium Playwright project.
 * Coach pages require minimum "coach" role via Clerk session.
 * External APIs (notification emails) are mocked to prevent side effects.
 */

test.describe("Coach review workflow", () => {
  test("coach can see submission queue", async ({ coachPage }) => {
    const coach = new CoachPage(coachPage);
    await coach.goto();

    // Coach dashboard should display the submission queue component
    await expect(coach.submissionQueue).toBeVisible();

    // The page should have the "Coach Dashboard" heading
    await expect(coachPage.locator("h1")).toContainText("Coach Dashboard");

    // Filter tabs should be present (Pending, Reviewed, All)
    const pendingTab = coachPage.getByRole("button", { name: "Pending" });
    const reviewedTab = coachPage.getByRole("button", { name: "Reviewed" });
    const allTab = coachPage.getByRole("button", { name: "All" });
    await expect(pendingTab).toBeVisible();
    await expect(reviewedTab).toBeVisible();
    await expect(allTab).toBeVisible();

    // Queue may be empty in test env -- check either submissions or empty state appears
    // Wait for loading to complete (skeleton disappears)
    await coachPage
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {
        // Loading may have already completed
      });

    // After loading, either submission cards or empty state should be visible
    const hasSubmissions = (await coach.getSubmissionCount()) > 0;
    if (hasSubmissions) {
      await expect(coach.submissionCards.first()).toBeVisible();
    } else {
      // Empty state shows "No submissions to review"
      await expect(
        coachPage.getByText("No submissions to review"),
      ).toBeVisible();
    }
  });

  test("coach can review a submission and send feedback", async ({
    coachPage,
  }) => {
    // Mock the notification API to prevent actual email sending
    await mockCoachFeedbackNotification(coachPage);

    // Mock the submissions API to return test data
    await coachPage.route("**/api/submissions?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          submissions: [
            {
              id: "test-submission-1",
              type: "text",
              response: "Test student answer",
              score: 85,
              aiFeedback: "Good attempt with minor errors",
              transcription: null,
              status: "pending_review",
              createdAt: new Date().toISOString(),
              studentId: "student-1",
              studentName: "Test Student",
              studentEmail: "student@test.com",
              lessonId: "lesson-1",
              lessonTitle: "Lesson 1: Greetings",
              interactionId: "interaction-1",
              interactionPrompt: "Say hello in Cantonese",
            },
          ],
        }),
      }),
    );

    // Mock the individual submission detail API
    await coachPage.route("**/api/submissions/test-submission-1", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            submission: {
              id: "test-submission-1",
              type: "text",
              response: "Test student answer",
              audioData: null,
              score: 85,
              aiFeedback: "Good attempt with minor errors",
              transcription: null,
              status: "pending_review",
              reviewedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            student: {
              id: "student-1",
              name: "Test Student",
              email: "student@test.com",
            },
            lesson: {
              id: "lesson-1",
              title: "Lesson 1: Greetings",
              moduleId: "module-1",
            },
            interaction: {
              id: "interaction-1",
              prompt: "Say hello in Cantonese",
              expectedAnswer: "Hello",
              type: "text",
            },
            feedback: null,
            notes: [],
          }),
        });
      }
      return route.continue();
    });

    // Mock the feedback submission API
    await coachPage.route(
      "**/api/submissions/test-submission-1/feedback",
      (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "feedback-1",
              feedbackText: "Great work, keep practicing!",
              loomUrl: null,
              createdAt: new Date().toISOString(),
            }),
          });
        }
        return route.continue();
      },
    );

    // Mock the notes API
    await coachPage.route(
      "**/api/submissions/test-submission-1/notes",
      (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
          });
        }
        return route.continue();
      },
    );

    const coach = new CoachPage(coachPage);
    await coach.goto();

    // Wait for submission cards to appear
    await expect(coach.submissionCards.first()).toBeVisible();

    // Click on the first submission to open detail view
    await coach.openSubmission(0);

    // Wait for submission detail page to load
    await expect(coachPage.locator("h1")).toContainText("Review Submission");

    // Verify student info is shown
    await expect(coachPage.getByText("Test Student")).toBeVisible();

    // Verify the AI score is displayed
    await expect(coachPage.getByText("85")).toBeVisible();

    // Type feedback text in the feedback form
    const feedbackInput = coachPage.locator('[data-testid="feedback-input"]');
    await expect(feedbackInput).toBeVisible();
    await feedbackInput.fill("Great work, keep practicing!");

    // Click send feedback button
    const sendButton = coachPage.locator('[data-testid="send-feedback"]');
    await sendButton.click();

    // Assert success indicator appears (the "Reviewed" badge in feedback form)
    const successIndicator = coachPage.locator(
      '[data-testid="feedback-success"]',
    );
    await expect(successIndicator).toBeVisible({ timeout: 10000 });
    await expect(successIndicator).toContainText("Reviewed");
  });

  test("coach can add notes to a submission", async ({ coachPage }) => {
    // Mock the submissions list API
    await coachPage.route("**/api/submissions?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          submissions: [
            {
              id: "test-submission-2",
              type: "text",
              response: "Another student answer",
              score: 72,
              aiFeedback: "Needs improvement",
              transcription: null,
              status: "pending_review",
              createdAt: new Date().toISOString(),
              studentId: "student-2",
              studentName: "Another Student",
              studentEmail: "student2@test.com",
              lessonId: "lesson-2",
              lessonTitle: "Lesson 2: Numbers",
              interactionId: "interaction-2",
              interactionPrompt: "Count from 1 to 5 in Mandarin",
            },
          ],
        }),
      }),
    );

    // Mock the individual submission detail API
    await coachPage.route(
      "**/api/submissions/test-submission-2",
      (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              submission: {
                id: "test-submission-2",
                type: "text",
                response: "Another student answer",
                audioData: null,
                score: 72,
                aiFeedback: "Needs improvement",
                transcription: null,
                status: "pending_review",
                reviewedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              student: {
                id: "student-2",
                name: "Another Student",
                email: "student2@test.com",
              },
              lesson: {
                id: "lesson-2",
                title: "Lesson 2: Numbers",
                moduleId: "module-1",
              },
              interaction: {
                id: "interaction-2",
                prompt: "Count from 1 to 5 in Mandarin",
                expectedAnswer: null,
                type: "text",
              },
              feedback: null,
              notes: [],
            }),
          });
        }
        return route.continue();
      },
    );

    // Mock the notes API for GET (empty initially) and POST (returns new note)
    let notesList: Array<{
      id: string;
      content: string;
      visibility: string;
      createdAt: string;
      coach: { id: string; name: string | null };
    }> = [];

    await coachPage.route(
      "**/api/submissions/test-submission-2/notes**",
      (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(notesList),
          });
        }
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          const newNote = {
            id: `note-${Date.now()}`,
            content: body.content,
            visibility: body.visibility || "internal",
            createdAt: new Date().toISOString(),
            coach: { id: "coach-1", name: "Test Coach" },
          };
          notesList = [newNote, ...notesList];
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(newNote),
          });
        }
        return route.continue();
      },
    );

    // Mock the feedback API for GET
    await coachPage.route(
      "**/api/submissions/test-submission-2/feedback",
      (route) => route.continue(),
    );

    const coach = new CoachPage(coachPage);
    await coach.goto();

    // Click on the submission
    await expect(coach.submissionCards.first()).toBeVisible();
    await coach.openSubmission(0);

    // Wait for submission detail page to load
    await expect(coachPage.locator("h1")).toContainText("Review Submission");

    // Find the notes input area
    const noteInput = coachPage.locator('[data-testid="note-input"]');
    await expect(noteInput).toBeVisible();

    // Type a note
    const noteText = "Student needs extra practice with tones";
    await noteInput.fill(noteText);

    // Submit the note by clicking the "Add Note" button
    const addNoteButton = coachPage.locator(
      '[data-testid="add-note-button"]',
    );
    await addNoteButton.click();

    // Assert the note appears in the notes list (optimistic update)
    const noteItem = coachPage.locator('[data-testid="note-item"]');
    await expect(noteItem.first()).toBeVisible({ timeout: 5000 });
    await expect(noteItem.first()).toContainText(noteText);

    // The note input should be cleared after successful submission
    await expect(noteInput).toHaveValue("");
  });
});
