import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreads, videoThreadSteps } from "@/db/schema";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const threads = await db
      .select({
        id: videoThreads.id,
        title: videoThreads.title,
        description: videoThreads.description,
        createdAt: videoThreads.createdAt,
        stepCount: sql<number>`count(${videoThreadSteps.id})`,
      })
      .from(videoThreads)
      .leftJoin(videoThreadSteps, eq(videoThreads.id, videoThreadSteps.threadId))
      .groupBy(videoThreads.id)
      .orderBy(desc(videoThreads.createdAt));

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("Failed to fetch video threads:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const [newThread] = await db
      .insert(videoThreads)
      .values({
        title,
        description,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json({ thread: newThread });
  } catch (error) {
    console.error("Failed to create video thread:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
