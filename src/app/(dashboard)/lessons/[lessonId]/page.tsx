import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  users,
  lessons,
  interactions,
} from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { resolvePermissions, canAccessLesson } from "@/lib/permissions";
import { hasMinimumRole } from "@/lib/auth";
import { userHasLtoStudentTag } from "@/lib/tag-feature-access";
import { ChevronLeft, BookOpenText, FileText, Link as LinkIcon, Download } from "lucide-react";
import { checkLessonUnlock } from "@/lib/unlock";
import { InteractiveVideoPlayer } from "@/components/video/InteractiveVideoPlayer";
import { VoiceConversation } from "@/components/voice/VoiceConversation";
import { ErrorAlert } from "@/components/ui/error-alert";
import { LessonControls } from "@/components/lesson/LessonControls";
import { ChallengeAssignment } from "@/components/assignments/ChallengeAssignment";
import { ListeningPracticeAssignment } from "@/components/assignments/ListeningPracticeAssignment";
import { VocalHackAssignment } from "@/components/assignments/VocalHackAssignment";
import { DiaryChallenge } from "@/components/assignments/DiaryChallenge";
import type { ChallengeConfig, ListeningPracticeConfig, VocalHackConfig } from "@/lib/assignment-types";

// Demo playback ID for testing when lesson has no Mux playback ID
const DEMO_PLAYBACK_ID = "a4nOgmxGWg6gULfcBbAa00gXyfcwPnAFldF8RdsNyk8M";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".mp4", ".wav", ".ogg", ".aac", ".flac", ".webm", ".opus"]);
function isAudioUrl(url: string) {
  try {
    const ext = new URL(url).pathname.split(".").pop();
    return ext ? AUDIO_EXTENSIONS.has(`.${ext.toLowerCase()}`) : false;
  } catch {
    const ext = url.split("?")[0].split(".").pop();
    return ext ? AUDIO_EXTENSIONS.has(`.${ext.toLowerCase()}`) : false;
  }
}

interface PageProps {
  params: Promise<{ lessonId: string }>;
}

/**
 * Lesson player page - displays video player with interactions for a lesson.
 * Also displays rich text content and attachments.
 *
 * Access control:
 * - Requires authenticated user
 * - User must have valid course access
 * - Lesson must be unlocked (linear progression)
 */
export default async function LessonPlayerPage({ params }: PageProps) {
  const { lessonId } = await params;

  // 1. Auth check
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
  }

  // 2. Get internal user ID
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) {
    redirect("/sign-in");
  }

  // 3. Fetch lesson with module, course, and attachments
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    with: {
      module: {
        with: {
          course: true,
        },
      },
      attachments: {
        orderBy: (attachments, { asc }) => [asc(attachments.sortOrder)],
      },
    },
  });

  if (!lesson) {
    notFound();
  }

  const courseId = lesson.module.course.id;

  // 4. Verify user has valid access via permission resolver (full hierarchy check)
  const isCoachOrAbove = await hasMinimumRole("coach");
  if (!isCoachOrAbove) {
    // Classic LTO students don't get regular lessons — send them to Accelerator
    if (await userHasLtoStudentTag(user.id)) {
      redirect("/dashboard/accelerator");
    }
    const permissions = await resolvePermissions(user.id);
    const hasAccess = await canAccessLesson(permissions, lessonId);
    if (!hasAccess) {
      redirect("/courses");
    }
  }

  // 5. Check unlock status
  const unlockStatus = await checkLessonUnlock(user.id, lessonId);
  if (!unlockStatus.isUnlocked) {
    // Lesson is locked, redirect to course detail page
    redirect(`/courses/${courseId}`);
  }

  // 6. Fetch interactions for this lesson (graceful degradation on failure)
  let cuePoints: {
    id: string;
    timestamp: number;
    interactionId: string;
    completed: boolean;
    language: string;
    type: string;
    prompt: string;
    expectedAnswer: string | null;
    correctThreshold: number | null;
    videoPromptId?: string;
  }[] = [];
  let interactionsError = false;

  try {
    const lessonInteractions = await db.query.interactions.findMany({
      where: and(
        eq(interactions.lessonId, lessonId),
        isNull(interactions.deletedAt)
      ),
      orderBy: [asc(interactions.timestamp)],
    });

    // 7. Convert interactions to cue points format
    cuePoints = lessonInteractions.map((interaction) => ({
      id: `cue-${interaction.id}`,
      timestamp: interaction.timestamp,
      interactionId: interaction.id,
      completed: false,
      language: interaction.language,
      type: interaction.type,
      prompt: interaction.prompt,
      expectedAnswer: interaction.expectedAnswer,
      correctThreshold: interaction.correctThreshold,
      videoPromptId: interaction.videoPromptId || undefined,
    }));
  } catch (error) {
    console.error("Failed to load lesson interactions:", error);
    interactionsError = true;
  }

  // Derive whether lesson has readable Chinese text for the Reader link
  const interactionPrompts = cuePoints
    .map(cp => cp.prompt)
    .filter(Boolean)
    .filter((text, idx, arr) => arr.indexOf(text) === idx);
  const hasReadableText = interactionPrompts.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Course
        </Link>

        {/* Lesson header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-zinc-400 mt-2">{lesson.description}</p>
          )}
        </header>

        {/* Open in Reader link */}
        {hasReadableText && (
          <Link
            href={`/dashboard/reader?lessonId=${lessonId}`}
            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-4"
          >
            <BookOpenText className="w-4 h-4" />
            Open in Reader
          </Link>
        )}

        {/* Interactions error */}
        {interactionsError && (
          <ErrorAlert
            message="Some lesson interactions could not be loaded. The video will play without interactive checkpoints."
            className="mb-4"
          />
        )}

        {/* Video player */}
        {/* Only show "Video not available" warning if there is also NO text content */}
        {!lesson.muxPlaybackId && !lesson.content && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-sm px-4 py-2 rounded-lg mb-6">
            This lesson has no content yet.
          </div>
        )}
        
        {lesson.muxPlaybackId && (
          <div data-testid="video-player-area" className="rounded-lg overflow-hidden">
            <InteractiveVideoPlayer
              playbackId={lesson.muxPlaybackId}
              cuePoints={cuePoints}
              lessonId={lessonId}
              courseId={courseId}
              title={lesson.title}
            />
          </div>
        )}

        {/* Rich Text Content */}
        {lesson.content && (
          <div className="mt-8 prose prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
          </div>
        )}

        {/* Embedded form / iframe (e.g. Google Form) */}
        {(lesson as {embedUrl?: string | null}).embedUrl && (
          <div className="mt-8">
            <iframe
              src={(lesson as {embedUrl?: string | null}).embedUrl!}
              className="w-full rounded-lg border border-zinc-800"
              style={{ minHeight: "600px" }}
              title="Embedded content"
              allowFullScreen
            />
          </div>
        )}

        {/* Attachments & Resources */}
        {lesson.attachments && lesson.attachments.length > 0 && (
          <div className="mt-8 pt-8 border-t border-zinc-800">
            <h3 className="text-lg font-semibold mb-4 text-white">Resources</h3>
            <div className="grid gap-4">
              {lesson.attachments.map((att) => {
                const isAudio = att.type === "file" && isAudioUrl(att.url);
                if (isAudio) {
                  return (
                    <div key={att.id} className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                      <p className="text-sm font-medium text-white mb-3">{att.title}</p>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls className="w-full" preload="metadata">
                        <source src={att.url} />
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  );
                }
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 transition-colors group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors">
                      {att.type === "file" ? (
                        <FileText className="h-5 w-5 text-zinc-400" />
                      ) : (
                        <LinkIcon className="h-5 w-5 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{att.title}</p>
                      <p className="text-xs text-zinc-500 truncate">{att.url}</p>
                    </div>
                    <Download className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Voice conversation practice */}
        <div className="mt-6">
          <VoiceConversation
            lessonId={lesson.id}
            lessonTitle={lesson.title}
          />
        </div>

        {/* Assignment type UI — rendered per lesson type */}
        {(() => {
          const lt = (lesson as { lessonType?: string }).lessonType;
          const rawConfig = (lesson as { assignmentConfig?: string | null }).assignmentConfig;
          const confirmMsg = (lesson as { confirmationMessage?: string | null }).confirmationMessage;
          let config: Record<string, unknown> = {};
          try { if (rawConfig) config = JSON.parse(rawConfig); } catch { /* ignore */ }

          if (lt === "challenge") {
            return (
              <ChallengeAssignment
                lessonId={lessonId}
                config={config as ChallengeConfig}
                confirmationMessage={confirmMsg}
              />
            );
          }
          if (lt === "listening_practice") {
            return (
              <ListeningPracticeAssignment
                lessonId={lessonId}
                config={config as ListeningPracticeConfig}
              />
            );
          }
          if (lt === "vocal_hack") {
            return (
              <VocalHackAssignment
                lessonId={lessonId}
                config={config as VocalHackConfig}
                confirmationMessage={confirmMsg}
              />
            );
          }
          if (lt === "diary_challenge") {
            return (
              <DiaryChallenge
                lessonId={lessonId}
                confirmationMessage={confirmMsg}
              />
            );
          }
          return null;
        })()}

        {/* Lesson Controls (Mark Complete / Next Lesson) */}
        <LessonControls lessonId={lessonId} courseId={courseId} />

        {/* Lesson metadata */}
        <div className="mt-6 text-sm text-zinc-500">
          <p>
            Module: {lesson.module.title} | Course: {lesson.module.course.title}
          </p>
        </div>
      </div>
  );
}