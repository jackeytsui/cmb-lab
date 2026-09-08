import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, getNeonSql } from "@/db";
import {
  betaFeedback,
  users,
  type BetaFeedbackCategory,
  type BetaFeedbackStatus,
} from "@/db/schema";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { getBetaFeedbackStatusCopy } from "@/lib/beta-feedback-status";
import { sendBetaFeedbackStatusEmail } from "@/lib/beta-feedback-status-email";
import { sendBetaFeedbackStatusPush } from "@/lib/web-push";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z
    .enum(["new", "reviewing", "planned", "resolved", "closed"])
    .optional(),
  adminNote: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const statusFilter = ["new", "reviewing", "planned", "resolved", "closed"].includes(
    status ?? "",
  )
    ? (status as "new" | "reviewing" | "planned" | "resolved" | "closed")
    : null;

  const [items, counts] = await Promise.all([
    db
      .select({
        id: betaFeedback.id,
        category: betaFeedback.category,
        message: betaFeedback.message,
        pagePath: betaFeedback.pagePath,
        source: betaFeedback.source,
        status: betaFeedback.status,
        adminNote: betaFeedback.adminNote,
        createdAt: betaFeedback.createdAt,
        updatedAt: betaFeedback.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(betaFeedback)
      .innerJoin(users, eq(betaFeedback.userId, users.id))
      .where(statusFilter ? eq(betaFeedback.status, statusFilter) : undefined)
      .orderBy(desc(betaFeedback.createdAt))
      .limit(100),
    db
      .select({
        status: betaFeedback.status,
        count: sql<number>`count(*)::int`,
      })
      .from(betaFeedback)
      .groupBy(betaFeedback.status),
  ]);

  return NextResponse.json({ items, counts });
}

export async function PATCH(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const reviewer = await getRealUser();
  if (!reviewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.status && parsed.data.adminNote === undefined)) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const [current] = await db
    .select({
      id: betaFeedback.id,
      userId: betaFeedback.userId,
      category: betaFeedback.category,
      status: betaFeedback.status,
      userName: users.name,
      userEmail: users.email,
    })
    .from(betaFeedback)
    .innerJoin(users, eq(betaFeedback.userId, users.id))
    .where(eq(betaFeedback.id, parsed.data.id))
    .limit(1);

  if (!current) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  const nextStatus = parsed.data.status;
  if (!nextStatus || nextStatus === current.status) {
    if (parsed.data.adminNote !== undefined) {
      await db
        .update(betaFeedback)
        .set({
          adminNote: parsed.data.adminNote || null,
          reviewedBy: reviewer.id,
          updatedAt: new Date(),
        })
        .where(eq(betaFeedback.id, parsed.data.id));
    }

    return NextResponse.json({
      ok: true,
      statusChanged: false,
      studentUpdate: { inApp: false, email: "not_needed" },
    });
  }

  const reference = current.id.slice(0, 8);
  const copy = getBetaFeedbackStatusCopy({
    category: current.category,
    status: nextStatus,
    reference,
  });
  const linkUrl = "/dashboard#support-feedback";
  const metadata = JSON.stringify({
    betaFeedbackId: current.id,
    reference,
    previousStatus: current.status,
    status: nextStatus,
  });
  const adminNoteProvided = parsed.data.adminNote !== undefined;
  const adminNote = parsed.data.adminNote || null;
  const neonSql = getNeonSql();

  type TransitionRow = {
    id: string;
    user_id: string;
    category: BetaFeedbackCategory;
    previous_status: BetaFeedbackStatus;
    status: BetaFeedbackStatus;
    updated_at: string | Date;
    notification_id: string | null;
  };

  // The stage change and in-app notification are one atomic statement. The
  // expected previous stage prevents duplicate notifications on retries and
  // prevents one reviewer from silently overwriting another reviewer's move.
  const transitionRows = await neonSql`
    WITH updated_feedback AS (
      UPDATE beta_feedback AS feedback
      SET
        status = ${nextStatus}::beta_feedback_status,
        admin_note = CASE
          WHEN ${adminNoteProvided}::boolean THEN ${adminNote}
          ELSE feedback.admin_note
        END,
        reviewed_by = ${reviewer.id}::uuid,
        updated_at = NOW()
      WHERE feedback.id = ${current.id}::uuid
        AND feedback.status = ${current.status}::beta_feedback_status
      RETURNING
        feedback.id,
        feedback.user_id,
        feedback.category,
        ${current.status}::beta_feedback_status AS previous_status,
        feedback.status,
        feedback.updated_at
    ),
    created_notification AS (
      INSERT INTO notifications
        (user_id, type, category, title, body, link_url, metadata)
      SELECT
        updated_feedback.user_id,
        'system'::notification_type,
        'feedback'::notification_category,
        ${copy.notificationTitle},
        ${copy.notificationBody},
        ${linkUrl},
        ${metadata}
      FROM updated_feedback
      WHERE NOT EXISTS (
        SELECT 1
        FROM notification_preferences
        WHERE notification_preferences.user_id = updated_feedback.user_id
          AND notification_preferences.category = 'feedback'::notification_category
          AND notification_preferences.muted = TRUE
      )
      RETURNING id
    )
    SELECT
      updated_feedback.*,
      created_notification.id AS notification_id
    FROM updated_feedback
    LEFT JOIN created_notification ON TRUE
  `;
  const transition = (transitionRows as unknown as TransitionRow[])[0];

  if (!transition) {
    return NextResponse.json(
      { error: "This request changed while you were updating it. Refresh and try again." },
      { status: 409 },
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin
  ).replace(/\/$/, "");
  const pushPromise = transition.notification_id
    ? sendBetaFeedbackStatusPush(
        {
          id: current.id,
          title: copy.notificationTitle,
          body: copy.notificationBody,
          linkUrl,
        },
        current.userId,
      )
    : Promise.resolve({ sent: 0, removed: 0 });
  const emailPromise = transition.notification_id
    ? sendBetaFeedbackStatusEmail({
        studentEmail: current.userEmail,
        studentName: current.userName || current.userEmail,
        categoryLabel: copy.categoryLabel,
        statusLabel: copy.statusLabel,
        message: copy.message,
        emailSubject: copy.emailSubject,
        reference,
        dashboardUrl: `${appUrl}${linkUrl}`,
        idempotencyKey: `beta-feedback-${current.id}-${new Date(transition.updated_at).getTime()}`,
      })
    : Promise.resolve("muted" as const);
  const [push, email] = await Promise.all([pushPromise, emailPromise]);

  return NextResponse.json({
    ok: true,
    statusChanged: true,
    status: transition.status,
    publicStatusLabel: copy.statusLabel,
    studentUpdate: {
      history: true,
      inApp: Boolean(transition.notification_id),
      browserPush: push.sent,
      email,
    },
  });
}
