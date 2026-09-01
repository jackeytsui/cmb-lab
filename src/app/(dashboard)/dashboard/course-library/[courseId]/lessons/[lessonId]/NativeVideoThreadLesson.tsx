import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  videoThreadSessions,
  videoThreadSteps,
  videoThreads,
} from "@/db/schema";
import { VideoThreadPlayer } from "@/components/video-thread/VideoThreadPlayer";
import { CourseLibraryLessonControls } from "@/components/course-library/CourseLibraryLessonControls";
import type { PlayerStep } from "@/types/video-thread-player";
import { signMediaPath } from "@/lib/signed-media-url";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export async function NativeVideoThreadLesson({
  threadId,
  courseId,
  moduleId,
  lessonId,
  userId,
  initialCompleted,
  completedByDefault = false,
  description,
}: {
  threadId: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  userId: string | null;
  initialCompleted: boolean;
  completedByDefault?: boolean;
  description?: string;
}) {
  const thread = await db.query.videoThreads.findFirst({
    where: eq(videoThreads.id, threadId),
    with: {
      steps: {
        orderBy: [asc(videoThreadSteps.sortOrder)],
        with: { upload: true },
      },
    },
  });

  if (!thread) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This interactive video lesson has not finished importing yet.
        </p>
      </div>
    );
  }

  const existingSession = userId
    ? await db.query.videoThreadSessions.findFirst({
        where: and(
          eq(videoThreadSessions.threadId, threadId),
          eq(videoThreadSessions.studentId, userId),
          eq(videoThreadSessions.status, "in_progress"),
        ),
        orderBy: [desc(videoThreadSessions.startedAt)],
        columns: { id: true, lastStepId: true },
      })
    : null;

  const { steps: rawSteps, ...threadData } = thread;
  const steps: PlayerStep[] = rawSteps.map((step) => ({
    ...step,
    playbackUrl: isPrivateVercelBlobUrl(step.videoUrl)
      ? signMediaPath(`/api/video-threads/${thread.id}/media/${step.id}`)
      : step.videoUrl,
    logic: step.logic as PlayerStep["logic"],
    logicRules: step.logicRules as PlayerStep["logicRules"],
    responseOptions: step.responseOptions as PlayerStep["responseOptions"],
    allowedResponseTypes:
      step.allowedResponseTypes as PlayerStep["allowedResponseTypes"],
    upload: step.upload
      ? { muxPlaybackId: step.upload.muxPlaybackId }
      : null,
  }));

  return (
    <div className="space-y-5">
      {description ? (
        <div
          className="prose prose-invert prose-sm max-w-none rounded-lg border border-border bg-card p-5 text-muted-foreground prose-headings:text-foreground"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      ) : null}
      <VideoThreadPlayer
        thread={threadData}
        steps={steps}
        resumeSessionId={existingSession?.id ?? null}
        resumeStepId={existingSession?.lastStepId ?? null}
        courseLessonId={lessonId}
        completionHref={`/course-library/${courseId}/modules/${moduleId}`}
        completionLabel="Back to course"
      />
      <CourseLibraryLessonControls
        lessonId={lessonId}
        initialCompleted={initialCompleted}
        completedByDefault={completedByDefault}
      />
    </div>
  );
}
