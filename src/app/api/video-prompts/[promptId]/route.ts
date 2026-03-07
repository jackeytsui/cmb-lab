import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { videoPrompts } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/video-prompts/[promptId]
// Public or Student-facing route to get video prompt details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { promptId } = await params;

  try {
    const prompt = await db.query.videoPrompts.findFirst({
      where: eq(videoPrompts.id, promptId),
    });

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("Failed to fetch video prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}
