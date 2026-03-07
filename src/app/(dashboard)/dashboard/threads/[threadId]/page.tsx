import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { videoThreads, videoThreadSteps, videoThreadSessions } from "@/db/schema";
import { users } from "@/db/schema";
import { eq, asc, and, desc } from "drizzle-orm";
import { VideoThreadPlayer } from "@/components/video-thread/VideoThreadPlayer";
import { PlayerStep } from "@/types/video-thread-player";

interface PageProps {
  params: Promise<{ threadId: string }>;
}

/**
 * Student-facing thread player page.
 *
 * Server component that fetches thread + steps from DB,
 * casts jsonb fields to typed interfaces, and renders
 * the VideoThreadPlayer client component.
 */
export default async function ThreadPlayerPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { threadId } = await params;

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
    notFound();
  }

  // Look up DB user to get internal UUID (needed for session lookup)
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
    columns: { id: true },
  });

  // Query for an existing in_progress session for this student + thread
  let resumeSessionId: string | null = null;
  let resumeStepId: string | null = null;

  if (dbUser) {
    const existingSession = await db.query.videoThreadSessions.findFirst({
      where: and(
        eq(videoThreadSessions.threadId, threadId),
        eq(videoThreadSessions.studentId, dbUser.id),
        eq(videoThreadSessions.status, "in_progress")
      ),
      orderBy: [desc(videoThreadSessions.startedAt)],
      columns: { id: true, lastStepId: true },
    });

    if (existingSession) {
      resumeSessionId = existingSession.id;
      resumeStepId = existingSession.lastStepId;
    }
  }

  // Separate steps from thread and cast jsonb fields to typed interfaces
  const { steps: rawSteps, ...threadData } = thread;

  const typedSteps: PlayerStep[] = rawSteps.map((step) => ({
    ...step,
    logic: step.logic as PlayerStep["logic"],
    logicRules: step.logicRules as PlayerStep["logicRules"],
    responseOptions: step.responseOptions as PlayerStep["responseOptions"],
    allowedResponseTypes: step.allowedResponseTypes as PlayerStep["allowedResponseTypes"],
    upload: step.upload
      ? { muxPlaybackId: step.upload.muxPlaybackId }
      : null,
  }));

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">{threadData.title}</h1>
      <VideoThreadPlayer
        thread={threadData}
        steps={typedSteps}
        resumeSessionId={resumeSessionId}
        resumeStepId={resumeStepId}
      />
    </div>
  );
}
