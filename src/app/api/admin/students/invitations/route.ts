import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const actionEnum = z.enum([
  "upload_only",
  "upload_and_invite",
  "resend_invite",
  "remove_access",
]);

const inviteRecordSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().email(),
  role: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  courseEndDate: z.string().trim().optional(), // YYYY-MM-DD
  portalAccessStatus: z.enum(["active", "paused", "expired"]).optional(),
});

const invitationEmailSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().max(50000).optional(),
    html: z.string().trim().max(250000).optional(),
  })
  .refine((value) => Boolean(value.body || value.html), {
    message: "Invitation email must include body or html",
  });

const requestSchema = z
  .object({
    action: actionEnum,
    emails: z.array(z.string().email()).min(1).max(500).optional(),
    records: z.array(inviteRecordSchema).min(1).max(500).optional(),
    batchRole: z.enum(["student", "coach", "admin"]).optional(),
    expiresInDays: z.number().int().min(1).max(30).optional(),
    redirectUrl: z.string().url().optional(),
    invitationEmail: invitationEmailSchema.optional(),
  })
  .refine((data) => Boolean(data.emails?.length || data.records?.length), {
    message: "Either emails or records is required",
  });

type TargetRecord = {
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
  tags?: string[];
  courseEndDate?: string;
  portalAccessStatus?: "active" | "paused" | "expired";
};

type AccessResult = {
  email: string;
  success: boolean;
  userId?: string;
  invitationId?: string;
  message?: string;
  error?: string;
};

type InvitationEmailConfig = z.infer<typeof invitationEmailSchema>;

function normalizeDate(value?: string) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTargets(
  records: TargetRecord[] | undefined,
  emails: string[] | undefined,
  batchRole: "student" | "coach" | "admin" | undefined
) {
  const byEmail = new Map<string, TargetRecord>();

  for (const record of records ?? []) {
    const email = record.email.trim().toLowerCase();
    byEmail.set(email, {
      ...record,
      email,
      role: record.role?.trim() || batchRole,
      tags: record.tags?.map((t) => t.trim()).filter(Boolean),
      courseEndDate: normalizeDate(record.courseEndDate) ?? undefined,
      portalAccessStatus: record.portalAccessStatus,
    });
  }

  for (const emailRaw of emails ?? []) {
    const email = emailRaw.trim().toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { email, role: batchRole });
  }

  return Array.from(byEmail.values());
}

function buildInvitationMetadata(target: TargetRecord) {
  const now = new Date();
  const courseEndAt =
    target.courseEndDate && !Number.isNaN(new Date(target.courseEndDate).getTime())
      ? new Date(target.courseEndDate)
      : null;
  const normalizedRole = normalizeRole(target.role);
  const autoStatus = courseEndAt && courseEndAt.getTime() < now.getTime() ? "expired" : "active";
  const initialStatus = target.portalAccessStatus ?? autoStatus;

  return {
    role: normalizedRole,
    invitedBy: "admin_access_management",
    cmbInviteFirstName: target.firstName ?? null,
    cmbInviteLastName: target.lastName ?? null,
    cmbInviteRole: normalizedRole,
    cmbInviteTags: target.tags ?? [],
    cmbCourseEndDate: target.courseEndDate ?? null,
    cmbPortalAccessStatus: initialStatus,
    cmbPortalAccessRevoked: false,
  };
}

function replaceTemplateVars(template: string, target: TargetRecord, portalLink: string) {
  const firstName = (target.firstName || "").trim();
  const lastName = (target.lastName || "").trim();
  const studentName = `${firstName} ${lastName}`.trim() || target.email;
  return template
    .replaceAll("{{first_name}}", firstName || "Student")
    .replaceAll("{{last_name}}", lastName)
    .replaceAll("{{student_name}}", studentName)
    .replaceAll("{{email}}", target.email)
    .replaceAll("{{portal_link}}", portalLink);
}

function makeAbsoluteAssetUrls(html: string, appUrl: string) {
  const normalizedBase = appUrl.replace(/\/$/, "");
  return html.replace(/(src|href)=["']\/(?!\/)/gi, `$1="${normalizedBase}/`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtmlFromBody(subject: string, body: string, appUrl: string) {
  const safeSubject = escapeHtml(subject);
  const safeBody = escapeHtml(body).replace(/\n/g, "<br />");
  const logoUrl = `${appUrl.replace(/\/$/, "")}/canto-to-mando-logo.png`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <img src="${logoUrl}" alt="Canto Mando Lab" width="180" style="display:block;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 8px 24px;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;">${safeSubject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;font-size:15px;line-height:1.7;color:#374151;">
                ${safeBody}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendCustomInvitationEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const ghlWebhookUrl =
    process.env.GHL_INVITATION_WEBHOOK_URL?.trim() ||
    process.env.GHL_WEBHOOK_URL?.trim();
  if (ghlWebhookUrl) {
    const response = await fetch(ghlWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Failed to send invitation via GHL webhook: ${body}`);
    }
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "No email sender configured. Set GHL_INVITATION_WEBHOOK_URL (recommended) or RESEND_API_KEY."
    );
  }

  const from = process.env.INVITATION_EMAIL_FROM?.trim() || "CMB Lab <cmb-lab@thecmblueprint.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send custom invitation email: ${body}`);
  }
}

function buildCustomEmailForTarget(params: {
  target: TargetRecord;
  config: InvitationEmailConfig;
  appUrl: string;
  portalLink: string;
}) {
  const subject = replaceTemplateVars(params.config.subject, params.target, params.portalLink);
  const bodyTextTemplate = params.config.body || "";
  const bodyText = replaceTemplateVars(bodyTextTemplate, params.target, params.portalLink);
  const htmlTemplate = params.config.html;
  const htmlRaw = htmlTemplate
    ? replaceTemplateVars(htmlTemplate, params.target, params.portalLink)
    : buildEmailHtmlFromBody(subject, bodyText, params.appUrl);
  const html = makeAbsoluteAssetUrls(htmlRaw, params.appUrl);
  const text = bodyText || "You have been invited to Canto Mando Lab.";
  return { subject, html, text };
}

function normalizeRole(role?: string): "student" | "coach" | "admin" {
  const normalized = (role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "coach" || normalized === "student") {
    return normalized;
  }
  return "student";
}

async function upsertDbUserFromInvite(params: {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedRole = normalizeRole(params.role);
  const name = [params.firstName?.trim(), params.lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
  const safeName = name.length > 0 ? name : null;

  // Source of truth by Clerk ID first.
  const existingByClerk = await db.query.users.findFirst({
    where: eq(users.clerkId, params.clerkId),
    columns: { id: true },
  });
  if (existingByClerk) {
    await db
      .update(users)
      .set({
        email: normalizedEmail,
        name: safeName,
        role: normalizedRole,
        deletedAt: null,
      })
      .where(eq(users.id, existingByClerk.id));
    return;
  }

  // CSV overwrite behavior by unique email.
  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
    columns: { id: true },
  });
  if (existingByEmail) {
    await db
      .update(users)
      .set({
        clerkId: params.clerkId,
        email: normalizedEmail,
        name: safeName,
        role: normalizedRole,
        deletedAt: null,
      })
      .where(eq(users.id, existingByEmail.id));
    return;
  }

  await db.insert(users).values({
    clerkId: params.clerkId,
    email: normalizedEmail,
    name: safeName,
    role: normalizedRole,
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { action, expiresInDays = 14, batchRole } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
  const redirectUrl = parsed.data.redirectUrl || `${appUrl.replace(/\/$/, "")}/sign-in`;
  const invitationEmailConfig = parsed.data.invitationEmail;
  const targets = normalizeTargets(parsed.data.records, parsed.data.emails, batchRole);
  const clerk = await clerkClient();

  if ((action === "upload_only" || action === "upload_and_invite") && !parsed.data.records?.length) {
    return NextResponse.json(
      { error: "Upload actions require CSV records with first name, last name, and email." },
      { status: 400 }
    );
  }

  const results: AccessResult[] = [];

  for (const target of targets) {
    try {
      if ((action === "upload_only" || action === "upload_and_invite") && (!target.firstName || !target.lastName)) {
        results.push({
          email: target.email,
          success: false,
          error: "Missing first name or last name for upload action.",
        });
        continue;
      }

      const lookup = await clerk.users.getUserList({ emailAddress: [target.email], limit: 1 });
      let user = lookup.data[0] ?? null;

      if (action === "remove_access") {
        if (!user) {
          results.push({
            email: target.email,
            success: false,
            error: "User not found in Clerk",
          });
          continue;
        }
        await clerk.users.updateUserMetadata(user.id, {
          publicMetadata: {
            ...(user.publicMetadata ?? {}),
            cmbPortalAccessRevoked: true,
            cmbPortalAccessStatus: "paused",
            cmbPortalAccessRevokedAt: new Date().toISOString(),
            cmbPortalAccessRevokedReason: "admin_manual_pause",
          },
        });
        await clerk.users.lockUser(user.id);
        results.push({
          email: target.email,
          success: true,
          userId: user.id,
          message: "Access removed",
        });
        continue;
      }

      const metadata = buildInvitationMetadata(target);

      if (!user) {
        user = await clerk.users.createUser({
          emailAddress: [target.email],
          firstName: target.firstName,
          lastName: target.lastName,
          skipPasswordRequirement: true,
          publicMetadata: metadata,
        });
      } else {
        await clerk.users.updateUser(user.id, {
          firstName: target.firstName ?? user.firstName ?? undefined,
          lastName: target.lastName ?? user.lastName ?? undefined,
        });
        await clerk.users.updateUserMetadata(user.id, {
          publicMetadata: {
            ...(user.publicMetadata ?? {}),
            ...metadata,
          },
        });
      }

      // Always persist invite uploads to LMS users table immediately.
      await upsertDbUserFromInvite({
        clerkId: user.id,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        role: target.role,
      });

      const statusFromMetadata =
        (metadata.cmbPortalAccessStatus as "active" | "paused" | "expired") || "active";
      if (statusFromMetadata === "active") {
        // If previously locked/revoked, re-enable on active upload actions.
        try {
          await clerk.users.unlockUser(user.id);
        } catch {
          // No-op if user is not locked.
        }
      } else {
        try {
          await clerk.users.lockUser(user.id);
        } catch {
          // No-op if already locked.
        }
      }

      if (action === "upload_only") {
        results.push({
          email: target.email,
          success: true,
          userId: user.id,
          message: "Uploaded without sending invitation",
        });
        continue;
      }

      const useCustomInvitationEmail = Boolean(invitationEmailConfig);
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: target.email,
        notify: !useCustomInvitationEmail,
        ignoreExisting: true,
        redirectUrl,
        expiresInDays,
        publicMetadata: metadata,
      });

      if (useCustomInvitationEmail) {
        if (!invitationEmailConfig) {
          throw new Error("Invitation email config missing.");
        }
        const customEmail = buildCustomEmailForTarget({
          target,
          config: invitationEmailConfig,
          appUrl,
          portalLink: redirectUrl,
        });
        await sendCustomInvitationEmail({
          to: target.email,
          subject: customEmail.subject,
          html: customEmail.html,
          text: customEmail.text,
        });
      }

      results.push({
        email: target.email,
        success: true,
        userId: user.id,
        invitationId: invitation.id,
        message:
          action === "resend_invite"
            ? "Invitation email sent/resubmitted"
            : "Uploaded and invitation email sent",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operation failed";
      results.push({
        email: target.email,
        success: false,
        error: message,
      });
    }
  }

  const summary = {
    action,
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };

  return NextResponse.json({ summary, results });
}
