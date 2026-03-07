import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreads, videoThreadSteps } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { threadId } = await params;
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const thread = await db.query.videoThreads.findFirst({
      where: eq(videoThreads.id, threadId),
      with: {
        steps: {
          orderBy: [asc(videoThreadSteps.sortOrder)],
          with: {
            upload: true,
          },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ thread });
  } catch (error) {
    console.error("Failed to fetch video thread:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { threadId } = await params;
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, description } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const [updatedThread] = await db
      .update(videoThreads)
      .set({
        title,
        description,
        updatedAt: new Date(),
      })
      .where(eq(videoThreads.id, threadId))
      .returning();

    return NextResponse.json({ thread: updatedThread });
  } catch (error) {
    console.error("Failed to update video thread:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { threadId } = await params;
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await db.delete(videoThreads).where(eq(videoThreads.id, threadId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete video thread:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
