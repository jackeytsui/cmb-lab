import "server-only";

export interface CoachFeedbackNotification {
  studentEmail: string;
  studentName: string;
  lessonTitle: string;
  coachName: string;
  loomUrl?: string;
  feedbackText?: string;
}

/** Send a coach-feedback email through the configured server-side webhook. */
export async function sendCoachFeedbackNotification(
  payload: CoachFeedbackNotification,
): Promise<{ sent: boolean }> {
  const webhookUrl = process.env.N8N_COACH_FEEDBACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      "N8N_COACH_FEEDBACK_WEBHOOK_URL is not configured; feedback email skipped.",
    );
    return { sent: false };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
        Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
      }),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Notification service returned ${response.status}`);
  }
  return { sent: true };
}
