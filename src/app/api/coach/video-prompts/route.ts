import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoPrompts, videoUploads } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

const createPromptSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2_000).optional(),
    videoUrl: z.string().trim().url().max(2_000).optional(),
    uploadId: z.string().uuid().optional(),
    transcript: z.string().trim().max(100_000).optional(),
  })
  .strict()
  .refine((data) => data.videoUrl || data.uploadId, {
    message: "Either videoUrl or uploadId must be provided",
    path: ["videoUrl"],
  });

// GET /api/coach/video-prompts
// List all video prompts created by the current coach
export async function GET() {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const prompts = await db
      .select()
      .from(videoPrompts)
      .where(
        access.actor.role === "admin"
          ? undefined
          : eq(videoPrompts.coachId, access.actor.id),
      )
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
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const json = await request.json();
    const { title, description, videoUrl, uploadId, transcript } = createPromptSchema.parse(json);

    if (uploadId) {
      const upload = await db.query.videoUploads.findFirst({
        where: and(
          eq(videoUploads.id, uploadId),
          eq(videoUploads.category, "prompt"),
          access.realActor.role === "admin"
            ? undefined
            : eq(videoUploads.uploadedBy, access.realActor.clerkId),
        ),
        columns: { id: true },
      });
      if (!upload) {
        return NextResponse.json(
          { error: "Prompt upload not found" },
          { status: 404 },
        );
      }
    }

    const [newPrompt] = await db
      .insert(videoPrompts)
      .values({
        coachId: access.realActor.id,
        title,
        description,
        videoUrl: videoUrl || null,
        uploadId: uploadId || null,
        transcript: transcript || null,
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
