import { NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreadSessionReviews, videoThreadSessions } from "@/db/schema";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string; sessionId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId, sessionId } = await params;

  try {
    const body = await req.json();
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const loomUrl =
      typeof body.loomUrl === "string" ? body.loomUrl.trim() : "";

    if (!message && !loomUrl) {
      return NextResponse.json(
        { error: "Message or Loom URL is required" },
        { status: 400 }
      );
    }

    const session = await db.query.videoThreadSessions.findFirst({
      where: and(
        eq(videoThreadSessions.id, sessionId),
        eq(videoThreadSessions.threadId, threadId)
      ),
      columns: { id: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const [review] = await db
      .insert(videoThreadSessionReviews)
      .values({
        sessionId,
        coachId: currentUser.id,
        message: message || null,
        loomUrl: loomUrl || null,
      })
      .returning();

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Failed to save thread submission response:", error);
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    );
  }
}
