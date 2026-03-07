import { NextRequest, NextResponse } from "next/server";

interface NotificationPayload {
  studentEmail: string;
  studentName: string;
  lessonTitle: string;
  coachName: string;
  loomUrl?: string;
  feedbackText?: string;
}

/**
 * POST /api/notify/coach-feedback
 * Trigger email notification when coach sends feedback.
 * Internal API - called by feedback route, not exposed to client.
 */
export async function POST(request: NextRequest) {
  try {
    const body: NotificationPayload = await request.json();
    const { studentEmail, studentName, lessonTitle, coachName, loomUrl, feedbackText } = body;

    // Validate required fields
    if (!studentEmail || !studentName || !lessonTitle || !coachName) {
      return NextResponse.json(
        { error: "Missing required fields: studentEmail, studentName, lessonTitle, coachName" },
        { status: 400 }
      );
    }

    // Check if n8n webhook URL is configured
    const webhookUrl = process.env.N8N_COACH_FEEDBACK_WEBHOOK_URL;
    if (!webhookUrl) {
      // Development mode: log and return success
      console.warn(
        "N8N_COACH_FEEDBACK_WEBHOOK_URL not configured. Email notification skipped. " +
          "Configure webhook for email notifications to students."
      );
      console.log("Would have sent notification:", {
        studentEmail,
        studentName,
        lessonTitle,
        coachName,
        hasLoomUrl: !!loomUrl,
        hasFeedbackText: !!feedbackText,
      });
      return NextResponse.json({ success: true, mock: true });
    }

    // Call n8n webhook with 15 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
      body: JSON.stringify({
        studentEmail,
        studentName,
        lessonTitle,
        coachName,
        loomUrl,
        feedbackText,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(`n8n notification webhook failed: ${n8nResponse.status}`);
      return NextResponse.json(
        { error: "Notification service unavailable" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Notification webhook timed out");
      return NextResponse.json(
        { error: "Notification request timed out" },
        { status: 504 }
      );
    }
    console.error("Notification API error:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
