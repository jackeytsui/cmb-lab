import "server-only";

import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  lt,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  videoaskFormImports,
  videoaskImportModules,
  videoaskImportProjects,
  videoaskMediaImports,
  videoaskStepImports,
  videoThreadSteps,
  videoThreads,
  videoUploads,
  type User,
  type VideoAskIntegration,
} from "@/db/schema";
import { mux } from "@/lib/mux";
import {
  fetchVideoAskForm,
  getVideoAskConnection,
} from "./client";
import {
  normalizeVideoAskForm,
  videoAskFolderKey,
  type NormalizedVideoAskForm,
  type NormalizedVideoAskQuestion,
} from "./mapper";
import { VIDEO_THREAD_COMPLETE_TARGET } from "@/types/video-thread-player";

const ROOT_FOLDER_KEY = "__root__";

export type VideoAskImportResult = {
  status: "imported" | "skipped";
  formImportId: string;
  formId: string;
  formTitle: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  threadId: string;
  stats: Record<string, unknown>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureImportProject(
  connection: VideoAskIntegration,
  user: User,
) {
  const [existing] = await db
    .select()
    .from(videoaskImportProjects)
    .where(eq(videoaskImportProjects.organizationId, connection.organizationId))
    .limit(1);
  if (existing) return existing;

  const [course] = await db
    .insert(courseLibraryCourses)
    .values({
      title: `VideoAsk Migration — ${connection.organizationName}`,
      summary:
        "Native interactive lessons imported automatically from VideoAsk. " +
        "This course remains a draft until an administrator reviews and publishes it.",
      status: "draft",
      isPublished: false,
      createdBy: user.id,
      sortOrder: 0,
    })
    .returning();

  const [project] = await db
    .insert(videoaskImportProjects)
    .values({
      organizationId: connection.organizationId,
      courseId: course.id,
      createdBy: user.id,
    })
    .returning();
  return project;
}

async function ensureImportModule(
  project: typeof videoaskImportProjects.$inferSelect,
  form: NormalizedVideoAskForm,
) {
  const sourceFolderKey = videoAskFolderKey(form.folderId);
  const [existing] = await db
    .select()
    .from(videoaskImportModules)
    .where(
      and(
        eq(videoaskImportModules.projectId, project.id),
        eq(videoaskImportModules.sourceFolderKey, sourceFolderKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [moduleCount] = await db
    .select({ value: count() })
    .from(videoaskImportModules)
    .where(eq(videoaskImportModules.projectId, project.id));
  const title =
    form.folderName ||
    (sourceFolderKey === ROOT_FOLDER_KEY
      ? "Unfiled VideoAsk Forms"
      : `VideoAsk Folder ${sourceFolderKey.slice(0, 8)}`);

  const [module] = await db
    .insert(courseLibraryModules)
    .values({
      courseId: project.courseId,
      title,
      sortOrder: moduleCount?.value ?? 0,
    })
    .returning();
  const [mapping] = await db
    .insert(videoaskImportModules)
    .values({
      projectId: project.id,
      sourceFolderKey,
      sourceFolderId: form.folderId,
      sourceFolderName: form.folderName,
      moduleId: module.id,
    })
    .returning();
  return mapping;
}

function mediaKey(question: NormalizedVideoAskQuestion) {
  if (question.mediaId) return `id:${question.mediaId}`;
  if (!question.mediaUrl) return null;
  return `url:${createHash("sha256").update(question.mediaUrl).digest("hex")}`;
}

async function enqueueMedia(
  connection: VideoAskIntegration,
  question: NormalizedVideoAskQuestion,
) {
  if (!question.mediaUrl) return null;
  if (
    question.mediaType &&
    question.mediaType !== "video" &&
    question.mediaType !== "audio"
  ) {
    return null;
  }
  const sourceMediaKey = mediaKey(question);
  if (!sourceMediaKey) return null;

  const [media] = await db
    .insert(videoaskMediaImports)
    .values({
      organizationId: connection.organizationId,
      sourceMediaKey,
      sourceMediaId: question.mediaId,
      sourceUrl: question.mediaUrl,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [
        videoaskMediaImports.organizationId,
        videoaskMediaImports.sourceMediaKey,
      ],
      set: {
        sourceUrl: question.mediaUrl,
        sourceMediaId: question.mediaId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return media;
}

function destinationForQuestion(
  sourceQuestionId: string | null,
  stepIds: Map<string, string>,
  warnings: string[],
) {
  if (sourceQuestionId === null) return VIDEO_THREAD_COMPLETE_TARGET;
  const destination = stepIds.get(sourceQuestionId);
  if (!destination) {
    warnings.push(`Logic target ${sourceQuestionId} is not present in the form`);
    return null;
  }
  return destination;
}

async function createNativeThread(
  connection: VideoAskIntegration,
  form: NormalizedVideoAskForm,
  formImportId: string,
  user: User,
) {
  const [thread] = await db
    .insert(videoThreads)
    .values({
      title: form.title,
      description:
        form.description || `Imported from VideoAsk form ${form.id}`,
      createdBy: user.id,
    })
    .returning();

  const stepIds = new Map<string, string>();
  const stepRows = new Map<string, typeof videoThreadSteps.$inferSelect>();
  const warnings = [...form.warnings];
  let mediaQueued = 0;

  for (const [index, question] of form.questions.entries()) {
    const media = await enqueueMedia(connection, question);
    if (media && media.status === "pending") mediaQueued += 1;
    const [step] = await db
      .insert(videoThreadSteps)
      .values({
        threadId: thread.id,
        videoUrl: question.mediaUrl,
        mediaType: question.mediaType,
        sourceThumbnailUrl: question.thumbnailUrl,
        promptText: question.promptText,
        transcriptText: question.transcription,
        responseType: question.responseType,
        allowedResponseTypes: question.allowedResponseTypes,
        responseOptions: { options: question.options },
        logic: [],
        logicRules: [],
        isEndScreen: false,
        sortOrder: index,
        positionX: 0,
        positionY: 150 + index * 220,
      })
      .returning();
    stepIds.set(question.id, step.id);
    stepRows.set(question.id, step);

    await db
      .insert(videoaskStepImports)
      .values({
        formImportId,
        sourceQuestionId: question.id,
        sourceMediaId: question.mediaId,
        mediaImportId: media?.id ?? null,
        stepId: step.id,
        sourceSnapshot: question.source,
      })
      .onConflictDoUpdate({
        target: [
          videoaskStepImports.formImportId,
          videoaskStepImports.sourceQuestionId,
        ],
        set: {
          sourceMediaId: question.mediaId,
          mediaImportId: media?.id ?? null,
          stepId: step.id,
          sourceSnapshot: question.source,
        },
      });
  }

  for (const question of form.questions) {
    const step = stepRows.get(question.id);
    if (!step) continue;

    const conditionalLogic: Array<{
      condition: string;
      nextStepId: string;
    }> = [];
    let fallbackStepId: string | null = null;
    let defaultCompletes = false;

    for (const edge of question.logicEdges) {
      const destination = destinationForQuestion(
        edge.targetQuestionId,
        stepIds,
        warnings,
      );
      if (!destination) continue;
      if (edge.isDefault) {
        if (destination === VIDEO_THREAD_COMPLETE_TARGET) {
          defaultCompletes = true;
        } else {
          fallbackStepId = destination;
        }
      } else if (edge.conditionValue) {
        conditionalLogic.push({
          condition: edge.conditionValue,
          nextStepId: destination,
        });
      }
    }

    if (defaultCompletes && conditionalLogic.length > 0) {
      conditionalLogic.push({
        condition: "default",
        nextStepId: VIDEO_THREAD_COMPLETE_TARGET,
      });
    }

    await db
      .update(videoThreadSteps)
      .set({
        logic: conditionalLogic,
        fallbackStepId,
        isEndScreen: defaultCompletes && conditionalLogic.length === 0,
      })
      .where(eq(videoThreadSteps.id, step.id));
  }

  return {
    thread,
    warnings: uniqueStrings(warnings),
    mediaQueued,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function sourceTimestampMatches(
  sourceUpdatedAt: Date | null,
  importedUpdatedAt: Date | null,
) {
  if (!sourceUpdatedAt || !importedUpdatedAt) return false;
  return sourceUpdatedAt.getTime() === importedUpdatedAt.getTime();
}

export async function importVideoAskForm(input: {
  formId: string;
  user: User;
  force?: boolean;
}): Promise<VideoAskImportResult> {
  const connection = await getVideoAskConnection();
  if (!connection) throw new Error("VideoAsk is not connected");

  const rawForm = await fetchVideoAskForm(input.formId);
  const form = normalizeVideoAskForm(rawForm);
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify(form.source))
    .digest("hex");
  const project = await ensureImportProject(connection, input.user);
  const moduleMapping = await ensureImportModule(project, form);

  const [existing] = await db
    .select()
    .from(videoaskFormImports)
    .where(
      and(
        eq(videoaskFormImports.projectId, project.id),
        eq(videoaskFormImports.sourceFormId, form.id),
      ),
    )
    .limit(1);

  if (
    !input.force &&
    (existing?.status === "completed" ||
      existing?.status === "completed_with_warnings") &&
    existing.threadId &&
    existing.lessonId &&
    (sourceTimestampMatches(form.updatedAt, existing.sourceUpdatedAt) ||
      existing.stats.sourceFingerprint === sourceFingerprint)
  ) {
    return {
      status: "skipped",
      formImportId: existing.id,
      formId: form.id,
      formTitle: form.title,
      courseId: project.courseId,
      moduleId: moduleMapping.moduleId,
      lessonId: existing.lessonId,
      threadId: existing.threadId,
      stats: existing.stats,
    };
  }

  const now = new Date();
  const [formImport] = await db
    .insert(videoaskFormImports)
    .values({
      projectId: project.id,
      sourceFormId: form.id,
      sourceFormTitle: form.title,
      sourceFolderKey: videoAskFolderKey(form.folderId),
      sourceUpdatedAt: form.updatedAt,
      status: "importing",
      sourceSnapshot: form.source,
      importedBy: input.user.id,
      startedAt: now,
      completedAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [
        videoaskFormImports.projectId,
        videoaskFormImports.sourceFormId,
      ],
      set: {
        sourceFormTitle: form.title,
        sourceFolderKey: videoAskFolderKey(form.folderId),
        sourceUpdatedAt: form.updatedAt,
        status: "importing",
        sourceSnapshot: form.source,
        importedBy: input.user.id,
        startedAt: now,
        completedAt: null,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();

  let newThreadId: string | null = null;
  let newLessonId: string | null = null;
  try {
    const native = await createNativeThread(
      connection,
      form,
      formImport.id,
      input.user,
    );
    newThreadId = native.thread.id;

    const [lessonCount] = await db
      .select({ value: count() })
      .from(courseLibraryLessons)
      .where(eq(courseLibraryLessons.moduleId, moduleMapping.moduleId));
    const [lesson] = await db
      .insert(courseLibraryLessons)
      .values({
        moduleId: moduleMapping.moduleId,
        title: form.title,
        lessonType: "video_thread",
        content: {
          threadId: native.thread.id,
          description: form.description
            ? `<p>${escapeHtml(form.description)}</p>`
            : undefined,
          sourceProvider: "videoask",
          sourceFormId: form.id,
          sourceShareUrl: form.shareUrl,
        },
        sortOrder: lessonCount?.value ?? 0,
      })
      .returning();
    newLessonId = lesson.id;

    const stats = {
      questions: form.questions.length,
      promptTexts: form.questions.filter((question) => question.promptText).length,
      transcriptions: form.questions.filter((question) => question.transcription)
        .length,
      sourceMedia: form.questions.filter((question) => question.mediaUrl).length,
      mediaQueued: native.mediaQueued,
      logicActions: form.questions.reduce(
        (total, question) => total + question.logicEdges.length,
        0,
      ),
      warnings: native.warnings,
      sourceFingerprint,
    };

    await db
      .update(videoaskFormImports)
      .set({
        status: native.warnings.length > 0 ? "completed_with_warnings" : "completed",
        threadId: native.thread.id,
        lessonId: lesson.id,
        stats,
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(videoaskFormImports.id, formImport.id));

    // Remove the previous destination only after the replacement is complete.
    if (existing?.lessonId && existing.lessonId !== lesson.id) {
      await db
        .delete(courseLibraryLessons)
        .where(eq(courseLibraryLessons.id, existing.lessonId));
    }
    if (existing?.threadId && existing.threadId !== native.thread.id) {
      await db.delete(videoThreads).where(eq(videoThreads.id, existing.threadId));
    }

    return {
      status: "imported",
      formImportId: formImport.id,
      formId: form.id,
      formTitle: form.title,
      courseId: project.courseId,
      moduleId: moduleMapping.moduleId,
      lessonId: lesson.id,
      threadId: native.thread.id,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await db
      .update(videoaskFormImports)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(videoaskFormImports.id, formImport.id));
    if (newLessonId) {
      await db
        .delete(courseLibraryLessons)
        .where(eq(courseLibraryLessons.id, newLessonId));
    }
    if (newThreadId) {
      await db.delete(videoThreads).where(eq(videoThreads.id, newThreadId));
    }
    throw error;
  }
}

export async function processNextVideoAskMedia(user: User) {
  const [media] = await db
    .select()
    .from(videoaskMediaImports)
    .where(
      and(
        or(
          eq(videoaskMediaImports.status, "pending"),
          eq(videoaskMediaImports.status, "failed"),
        ),
        lt(videoaskMediaImports.attempts, 3),
      ),
    )
    .orderBy(asc(videoaskMediaImports.createdAt))
    .limit(1);

  if (!media) {
    const [processing] = await db
      .select({
        mediaId: videoaskMediaImports.id,
        uploadId: videoUploads.id,
        assetId: videoUploads.muxAssetId,
      })
      .from(videoaskMediaImports)
      .innerJoin(
        videoUploads,
        eq(videoaskMediaImports.videoUploadId, videoUploads.id),
      )
      .where(
        and(
          eq(videoaskMediaImports.status, "processing"),
          isNotNull(videoUploads.muxAssetId),
        ),
      )
      .orderBy(asc(videoaskMediaImports.createdAt))
      .limit(1);

    if (!processing?.assetId) return { status: "empty" as const };

    const asset = await mux.video.assets.retrieve(processing.assetId);
    if (asset.status === "ready") {
      const playbackId = asset.playback_ids?.[0]?.id ?? null;
      await db
        .update(videoUploads)
        .set({
          muxPlaybackId: playbackId,
          durationSeconds: asset.duration ? Math.round(asset.duration) : null,
          status: "ready",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(videoUploads.id, processing.uploadId));
      await db
        .update(videoaskMediaImports)
        .set({ status: "ready", lastError: null, updatedAt: new Date() })
        .where(eq(videoaskMediaImports.id, processing.mediaId));
      return {
        status: "ready" as const,
        action: "checked" as const,
        mediaId: processing.mediaId,
        assetId: processing.assetId,
      };
    }

    if (asset.status === "errored") {
      const errorMessage =
        asset.errors?.messages?.[0] || "Mux asset processing failed";
      await db
        .update(videoUploads)
        .set({
          status: "errored",
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(videoUploads.id, processing.uploadId));
      await db
        .update(videoaskMediaImports)
        .set({
          status: "failed",
          lastError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(videoaskMediaImports.id, processing.mediaId));
      return {
        status: "failed" as const,
        action: "checked" as const,
        mediaId: processing.mediaId,
        assetId: processing.assetId,
      };
    }

    return {
      status: "processing" as const,
      action: "checked" as const,
      mediaId: processing.mediaId,
      assetId: processing.assetId,
    };
  }

  await db
    .update(videoaskMediaImports)
    .set({
      status: "processing",
      attempts: media.attempts + 1,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(videoaskMediaImports.id, media.id));

  try {
    const asset = await mux.video.assets.create({
      inputs: [{ url: media.sourceUrl }],
      playback_policies: ["signed"],
      video_quality: "basic",
      passthrough: `videoask:${media.id}`,
      meta: {
        external_id: media.id,
        creator_id: user.id,
        title: `VideoAsk media ${media.sourceMediaId || media.id}`,
      },
    });
    const playbackId = asset.playback_ids?.[0]?.id ?? null;
    const isReady = asset.status === "ready";
    const [upload] = await db
      .insert(videoUploads)
      .values({
        muxUploadId: `videoask-import:${media.id}`,
        muxAssetId: asset.id,
        muxPlaybackId: playbackId,
        filename: `${media.sourceMediaId || media.id}.mp4`,
        status: isReady ? "ready" : "processing",
        category: "lesson",
        tags: ["videoask-import"],
        uploadedBy: user.clerkId,
      })
      .onConflictDoUpdate({
        target: videoUploads.muxUploadId,
        set: {
          muxAssetId: asset.id,
          muxPlaybackId: playbackId,
          status: isReady ? "ready" : "processing",
          errorMessage: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await db
      .update(videoaskMediaImports)
      .set({
        videoUploadId: upload.id,
        status: isReady ? "ready" : "processing",
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));

    const mappedSteps = await db
      .select({ stepId: videoaskStepImports.stepId })
      .from(videoaskStepImports)
      .where(eq(videoaskStepImports.mediaImportId, media.id));
    if (mappedSteps.length > 0) {
      await db
        .update(videoThreadSteps)
        .set({ uploadId: upload.id })
        .where(
          inArray(
            videoThreadSteps.id,
            mappedSteps.map((row) => row.stepId),
          ),
        );
    }

    return {
      status: isReady ? ("ready" as const) : ("processing" as const),
      action: "created" as const,
      mediaId: media.id,
      assetId: asset.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mux media import failed";
    await db
      .update(videoaskMediaImports)
      .set({
        status: "failed",
        lastError: message.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));
    throw error;
  }
}
