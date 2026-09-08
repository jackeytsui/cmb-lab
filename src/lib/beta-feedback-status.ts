import type {
  BetaFeedbackCategory,
  BetaFeedbackStatus,
} from "@/db/schema";

const CATEGORY_LABELS: Record<BetaFeedbackCategory, string> = {
  bug: "Bug report",
  feature_request: "Feature request",
  general: "Product feedback",
};

export const PUBLIC_BETA_FEEDBACK_STATUS_LABELS: Record<
  BetaFeedbackStatus,
  string
> = {
  new: "Submitted",
  reviewing: "Being reviewed",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_MESSAGES: Record<BetaFeedbackStatus, string> = {
  new: "Your request is in the queue and waiting for review.",
  reviewing: "Our team is reviewing your request and working through the next steps.",
  planned: "Our team reviewed your request and planned the next step.",
  resolved: "Our team marked your request as resolved. Thank you for helping us improve CMB Lab.",
  closed: "Our team closed your request. If you still need help, please send a new request through the CMB Lab Assistant.",
};

export function getBetaFeedbackStatusCopy(input: {
  category: BetaFeedbackCategory;
  status: BetaFeedbackStatus;
  reference: string;
}) {
  const categoryLabel = CATEGORY_LABELS[input.category];
  const statusLabel = PUBLIC_BETA_FEEDBACK_STATUS_LABELS[input.status];
  const message = STATUS_MESSAGES[input.status];

  return {
    categoryLabel,
    statusLabel,
    message,
    notificationTitle: `${categoryLabel} update: ${statusLabel}`,
    notificationBody: `${message} Reference: ${input.reference}.`,
    emailSubject: `${categoryLabel} ${input.reference}: ${statusLabel}`,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildBetaFeedbackStatusEmailHtml(input: {
  studentName: string;
  categoryLabel: string;
  statusLabel: string;
  message: string;
  reference: string;
  dashboardUrl: string;
}) {
  const studentName = escapeHtml(input.studentName);
  const categoryLabel = escapeHtml(input.categoryLabel);
  const statusLabel = escapeHtml(input.statusLabel);
  const message = escapeHtml(input.message);
  const reference = escapeHtml(input.reference);
  const dashboardUrl = escapeHtml(input.dashboardUrl);

  return `
    <div style="background:#f5f6fb;padding:32px 16px;font-family:Arial,sans-serif;color:#191b2a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ef;border-radius:14px;padding:28px">
        <p style="margin:0 0 16px">Hi ${studentName},</p>
        <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${categoryLabel}: ${statusLabel}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${message}</p>
        <p style="font-size:13px;color:#666b7d;margin:0 0 22px">Reference: ${reference}</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#2e3a97;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Open CMB Lab</a>
        <p style="font-size:13px;line-height:1.5;color:#666b7d;margin:22px 0 0">You can also see the current stage under <strong>Your requests</strong> in the CMB Lab Assistant.</p>
        <p style="font-size:14px;margin:22px 0 0">— The CMB Team</p>
      </div>
    </div>
  `;
}
