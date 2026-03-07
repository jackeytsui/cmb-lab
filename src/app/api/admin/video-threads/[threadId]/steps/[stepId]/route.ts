import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreadSteps } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string; stepId: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { stepId } = await params;
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

    const [updatedStep] = await db
      .update(videoThreadSteps)
      .set({
        promptText,
        videoUrl,
        uploadId,
        responseType,
        allowedResponseTypes,
        responseOptions,
        logic,
        isEndScreen,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(videoThreadSteps.id, stepId))
      .returning();

    return NextResponse.json({ step: updatedStep });
  } catch (error) {
    console.error("Failed to update thread step:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { stepId, threadId } = await params;
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    let replacementStepId: string | null = null;
    let useEndScreen = false;
    try {
      const body = await req.json();
      replacementStepId =
        typeof body?.replacementStepId === "string" ? body.replacementStepId : null;
      useEndScreen = !!body?.useEndScreen;
    } catch {
      // DELETE body is optional; guarded below if refs exist
    }

    const steps = await db
      .select()
      .from(videoThreadSteps)
      .where(eq(videoThreadSteps.threadId, threadId))
      .orderBy(asc(videoThreadSteps.sortOrder));

    const targetStep = steps.find((s) => s.id === stepId);
    if (!targetStep) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const stepIdSet = new Set(steps.map((s) => s.id));
    if (
      replacementStepId &&
      (replacementStepId === stepId || !stepIdSet.has(replacementStepId))
    ) {
      return NextResponse.json(
        { error: "Invalid replacement step" },
        { status: 400 }
      );
    }

    const replacementValue = useEndScreen ? "end_screen" : replacementStepId;

    const references = steps
      .filter((s) => s.id !== stepId)
      .flatMap((s) => {
        const refs: Array<{
          sourceStepId: string;
          sourcePrompt: string | null;
          field: "logic" | "logicRules" | "fallbackStepId";
        }> = [];

        const logic = (s.logic as Array<{ condition: string; nextStepId: string }> | null) ?? [];
        if (logic.some((l) => l.nextStepId === stepId)) {
          refs.push({
            sourceStepId: s.id,
            sourcePrompt: s.promptText,
            field: "logic",
          });
        }

        const logicRules =
          (s.logicRules as Array<{ id: string; nextStepId: string }> | null) ?? [];
        if (logicRules.some((r) => r.nextStepId === stepId)) {
          refs.push({
            sourceStepId: s.id,
            sourcePrompt: s.promptText,
            field: "logicRules",
          });
        }

        if (s.fallbackStepId === stepId) {
          refs.push({
            sourceStepId: s.id,
            sourcePrompt: s.promptText,
            field: "fallbackStepId",
          });
        }

        return refs;
      });

    if (references.length > 0 && !replacementValue) {
      return NextResponse.json(
        {
          error: "Step is referenced by other steps",
          code: "STEP_REFERENCED",
          references,
        },
        { status: 409 }
      );
    }

    // neon-http driver doesn't support transactions, use sequential queries
    if (references.length > 0 && replacementValue) {
      for (const step of steps.filter((s) => s.id !== stepId)) {
        const logic = (step.logic as Array<{ condition: string; nextStepId: string }> | null) ?? [];
        const updatedLogic = logic.map((l) =>
          l.nextStepId === stepId ? { ...l, nextStepId: replacementValue } : l
        );

        const logicRules =
          (step.logicRules as Array<{ id: string; nextStepId: string }> | null) ?? [];
        const updatedLogicRules = logicRules.map((r) =>
          r.nextStepId === stepId ? { ...r, nextStepId: replacementValue } : r
        );

        const fallbackStepId =
          step.fallbackStepId === stepId
            ? useEndScreen
              ? null
              : replacementStepId
            : step.fallbackStepId;

        if (
          JSON.stringify(updatedLogic) !== JSON.stringify(logic) ||
          JSON.stringify(updatedLogicRules) !== JSON.stringify(logicRules) ||
          step.fallbackStepId !== fallbackStepId
        ) {
          await db
            .update(videoThreadSteps)
            .set({
              logic: updatedLogic,
              logicRules: updatedLogicRules,
              fallbackStepId,
              updatedAt: new Date(),
            })
            .where(eq(videoThreadSteps.id, step.id));
        }
      }
    }

    await db.delete(videoThreadSteps).where(eq(videoThreadSteps.id, stepId));

    const remainingSteps = await db
      .select({ id: videoThreadSteps.id })
      .from(videoThreadSteps)
      .where(eq(videoThreadSteps.threadId, threadId))
      .orderBy(asc(videoThreadSteps.sortOrder));

    for (const [index, step] of remainingSteps.entries()) {
      await db
        .update(videoThreadSteps)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(videoThreadSteps.id, step.id));
    }

    return NextResponse.json({
      success: true,
      referencesUpdated: references.length,
    });
  } catch (error) {
    console.error("Failed to delete thread step:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
