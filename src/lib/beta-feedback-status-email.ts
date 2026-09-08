import "server-only";
import { buildBetaFeedbackStatusEmailHtml } from "@/lib/beta-feedback-status";

export type BetaFeedbackEmailDelivery =
  | "sent"
  | "not_configured"
  | "failed";

export async function sendBetaFeedbackStatusEmail(input: {
  studentEmail: string;
  studentName: string;
  categoryLabel: string;
  statusLabel: string;
  message: string;
  emailSubject: string;
  reference: string;
  dashboardUrl: string;
  idempotencyKey: string;
}): Promise<BetaFeedbackEmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[Beta Feedback] RESEND_API_KEY is not configured; the in-app status update remains available.",
    );
    return "not_configured";
  }

  const from =
    process.env.INVITATION_EMAIL_FROM?.trim() ||
    "CMB Lab <cmb-lab@thecmblueprint.com>";
  const html = buildBetaFeedbackStatusEmailHtml(input);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: input.studentEmail,
        subject: input.emailSubject,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[Beta Feedback] Resend returned ${response.status}: ${detail.slice(0, 500)}`,
      );
      return "failed";
    }

    return "sent";
  } catch (error) {
    console.error("[Beta Feedback] Status email failed:", error);
    return "failed";
  }
}
