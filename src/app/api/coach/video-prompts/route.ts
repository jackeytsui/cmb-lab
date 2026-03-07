import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { videoPrompts, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createPromptSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().optional(),
  videoUrl: z.string().optional(), // Now optional if uploadId is provided
  uploadId: z.string().uuid().optional(),
  transcript: z.string().optional(),
}).refine(data => data.videoUrl || data.uploadId, {
  message: "Either videoUrl or uploadId must be provided",
  path: ["videoUrl"],
});

// GET /api/coach/video-prompts
// List all video prompts created by the current coach
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const prompts = await db
      .select()
      .from(videoPrompts)
      .where(eq(videoPrompts.coachId, currentUser.id))
      .orderBy(desc(videoPrompts.createdAt));

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("Failed to fetch video prompts:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    );
  }
}

// POST /api/coach/video-prompts
// Create a new video prompt
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const json = await request.json();
    const { title, description, videoUrl, uploadId, transcript } = createPromptSchema.parse(json);

    const [newPrompt] = await db
      .insert(videoPrompts)
      .values({
        coachId: currentUser.id,
        title,
        description,
        videoUrl: videoUrl || null,
        uploadId: uploadId || null,
        transcript,
      })
      .returning();

    return NextResponse.json({ prompt: newPrompt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to create video prompt:", error);
    return NextResponse.json(
      { error: "Failed to create prompt" },
      { status: 500 }
    );
  }
}
