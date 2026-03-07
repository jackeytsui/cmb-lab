import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreadSteps } from "@/db/schema";
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
    const steps = await db
      .select()
      .from(videoThreadSteps)
      .where(eq(videoThreadSteps.threadId, threadId))
      .orderBy(asc(videoThreadSteps.sortOrder));

    return NextResponse.json({ steps });
  } catch (error) {
    console.error("Failed to fetch thread steps:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { threadId } = await params;
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      promptText,
      videoUrl,
      uploadId,
      responseType,
      allowedResponseTypes,
      responseOptions,
      logic,
      isEndScreen,
      sortOrder,
    } = body;

    const [newStep] = await db
      .insert(videoThreadSteps)
      .values({
        threadId,
        promptText,
        videoUrl,
        uploadId,
        responseType: responseType || "video",
        allowedResponseTypes,
        responseOptions,
        logic,
        isEndScreen,
        sortOrder: sortOrder || 0,
      })
      .returning();

    return NextResponse.json({ step: newStep });
  } catch (error) {
    console.error("Failed to create thread step:", error);
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
    const { steps } = body;

    if (!Array.isArray(steps)) {
        return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    // Process updates in parallel
    await Promise.all(steps.map(async (step: any) => {
        // Only process if it has a valid ID (simple check)
        if (!step.id) return;

        await db
            .insert(videoThreadSteps)
            .values({
                id: step.id,
                threadId,
                promptText: step.promptText,
                videoUrl: step.videoUrl,
                uploadId: step.uploadId,
                responseType: step.responseType,
                allowedResponseTypes: step.allowedResponseTypes,
                responseOptions: step.responseOptions,
                logic: step.logic,
                logicRules: step.logicRules,
                fallbackStepId: step.fallbackStepId,
                isEndScreen: step.isEndScreen,
                sortOrder: step.sortOrder,
                positionX: step.positionX ?? 0,
                positionY: step.positionY ?? 150,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: videoThreadSteps.id,
                set: {
                    promptText: step.promptText,
                    videoUrl: step.videoUrl,
                    uploadId: step.uploadId,
                    responseType: step.responseType,
                    allowedResponseTypes: step.allowedResponseTypes,
                    responseOptions: step.responseOptions,
                    logic: step.logic,
                    logicRules: step.logicRules,
                    fallbackStepId: step.fallbackStepId,
                    isEndScreen: step.isEndScreen,
                    sortOrder: step.sortOrder,
                    positionX: step.positionX ?? 0,
                    positionY: step.positionY ?? 150,
                    updatedAt: new Date(),
                }
            });
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save steps:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
