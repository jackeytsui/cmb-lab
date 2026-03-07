import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreadSteps, videoThreadSessions, videoThreadResponses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { evaluateRules } from "@/lib/logic-engine";
import { LogicRule } from "@/types/video-thread-player";
import { getCurrentUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authenticated user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await params;
    const body = await request.json();
    const { stepId, sessionId, response, studentContext } = body;

    if (!stepId) {
      return NextResponse.json({ error: "stepId required" }, { status: 400 });
    }

    if (!response || !response.type) {
      return NextResponse.json({ error: "response with type required" }, { status: 400 });
    }

    // --- Session Handling ---
    let activeSessionId: string;

    if (sessionId) {
      // Validate existing session belongs to this user + thread
      const existingSession = await db.query.videoThreadSessions.findFirst({
        where: and(
          eq(videoThreadSessions.id, sessionId),
          eq(videoThreadSessions.studentId, user.id),
          eq(videoThreadSessions.threadId, threadId),
        ),
      });

      if (!existingSession) {
        return NextResponse.json({ error: "Session not found or does not belong to user" }, { status: 404 });
      }

      activeSessionId = existingSession.id;
    } else {
      // Create a new session on first response submission
      const [newSession] = await db
        .insert(videoThreadSessions)
        .values({
          threadId,
          studentId: user.id,
          status: "in_progress",
        })
        .returning({ id: videoThreadSessions.id });

      activeSessionId = newSession.id;
    }

    // --- Response Storage ---
    // Response storage patterns:
    // - audio/video: content = muxPlaybackId, metadata = { muxPlaybackId }
    // - text: content = typed text, metadata = null
    // - button/multiple_choice: content = selected option value, metadata = null
    await db.insert(videoThreadResponses).values({
      sessionId: activeSessionId,
      stepId,
      responseType: response.type,
      content: response.content || null,
      metadata: response.metadata || null,
    });

    // --- Next Step Resolution (preserved logic engine) ---

    // 1. Fetch current step to determine immediate next connection
    const currentStep = await db.query.videoThreadSteps.findFirst({
      where: eq(videoThreadSteps.id, stepId),
    });

    if (!currentStep) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    let nextStepId: string | null = null;

    // Resolve Next Step from Current Step
    // Priority: 1. Logic (legacy/buttons), 2. Fallback (new default connection), 3. Sort Order
    if (currentStep.logic && Array.isArray(currentStep.logic)) {
      // e.g. Button choice
      const match = (currentStep.logic as Array<{ condition: string; nextStepId: string }>).find(
        (l) => l.condition === response?.content || l.condition === "default"
      );
      if (match) nextStepId = match.nextStepId;
    }

    if (!nextStepId && currentStep.fallbackStepId) {
      nextStepId = currentStep.fallbackStepId;
    }

    // If still null, try sortOrder + 1 (implicit linear)
    if (!nextStepId) {
      const nextInOrder = await db.query.videoThreadSteps.findFirst({
        where: and(
          eq(videoThreadSteps.threadId, threadId),
          eq(videoThreadSteps.sortOrder, currentStep.sortOrder + 1)
        ),
        columns: { id: true },
      });
      if (nextInOrder) nextStepId = nextInOrder.id;
    }

    // 2. Logic Engine Evaluation Loop (Recursively resolve Logic Nodes)
    // We loop until we find a "Content Node" (or end)
    let finalStepId = nextStepId;
    const visited = new Set<string>();

    while (finalStepId && !visited.has(finalStepId)) {
      visited.add(finalStepId);

      // Fetch the candidate next step
      const candidate = await db.query.videoThreadSteps.findFirst({
        where: eq(videoThreadSteps.id, finalStepId),
      });

      if (!candidate) {
        finalStepId = null;
        break;
      }

      // Check if it's a Logic Node (heuristic: has logicRules)
      const rules = candidate.logicRules as LogicRule[] | null;

      if (rules && rules.length > 0) {
        // It IS a Logic Node. Evaluate rules to find WHERE to go next.
        const context = {
          answer: response,
          student: studentContext,
        };

        const evaluatedNextId = evaluateRules(rules, context);

        if (evaluatedNextId) {
          finalStepId = evaluatedNextId;
        } else if (candidate.fallbackStepId) {
          finalStepId = candidate.fallbackStepId; // Else path
        } else {
          // Dead end in logic node -- no rules match and no fallback
          break;
        }
      } else {
        // It's a Content Step (Video/Question). Stop traversing.
        break;
      }
    }

    // --- Session Updates ---
    const completed = finalStepId === null;

    if (completed) {
      // Thread is finished -- mark session as completed
      await db
        .update(videoThreadSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
          lastStepId: stepId,
        })
        .where(eq(videoThreadSessions.id, activeSessionId));
    } else {
      // Update last step to the resolved next step
      await db
        .update(videoThreadSessions)
        .set({ lastStepId: finalStepId })
        .where(eq(videoThreadSessions.id, activeSessionId));
    }

    return NextResponse.json({
      nextStepId: finalStepId,
      sessionId: activeSessionId,
      completed,
    });
  } catch (error) {
    console.error("Error in respond:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
