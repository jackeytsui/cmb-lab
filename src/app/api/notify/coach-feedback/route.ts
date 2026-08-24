import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { sendCoachFeedbackNotification } from "@/lib/coach-feedback-notification";
import { isStaffRole } from "@/lib/platform-roles";

const notificationSchema = z.object({
  studentEmail: z.string().email().max(320),
  studentName: z.string().trim().min(1).max(200),
  lessonTitle: z.string().trim().min(1).max(500),
  coachName: z.string().trim().min(1).max(200),
  loomUrl: z.string().url().max(2_000).optional(),
  feedbackText: z.string().max(20_000).optional(),
}).strict();

/** Staff-only compatibility endpoint. Server code calls the shared helper directly. */
export async function POST(request: NextRequest) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = notificationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
  }

  try {
    const result = await sendCoachFeedbackNotification(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      "Coach feedback notification failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Notification service unavailable" },
      { status: 502 },
    );
  }
}
