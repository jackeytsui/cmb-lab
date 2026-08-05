import "server-only";

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import {
  and,
  asc,
  count,
  eq,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  videoaskFormImports,
  videoaskImportProjects,
  videoaskMediaImports,
  videoaskStepImports,
  type User,
  type VideoAskIntegration,
} from "@/db/schema";
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
import { videoAskBlobPath } from "./media-storage";

const MAX_MEDIA_ATTEMPTS = 6;
const STALE_MEDIA_PROCESSING_MS = 10 * 60 * 1_000;
const MEDIA_TRANSFER_TIMEOUT_MS = 280 * 1_000;
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

export type VideoAskImportResult = {
  status: "imported" | "skipped";
  formImportId: string;
  formId: string;
  formTitle: string;
  stats: Record<string, unknown>;
};

async function ensureSourceProject(
  connection: VideoAskIntegration,
  user: User,
) {
  const [existing] = await db
    .select()
    .from(videoaskImportProjects)
    .where(eq(videoaskImportProjects.organizationId, connection.organizationId))
    .limit(1);
  if (existing) return existing;

  const [project] = await db
    .insert(videoaskImportProjects)
    .values({
      organizationId: connection.organizationId,
      createdBy: user.id,
    })
    .onConflictDoUpdate({
      target: videoaskImportProjects.organizationId,
      set: { updatedAt: new Date() },
    })
    .returning();
  return project;
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

async function stageSourceSteps(
  connection: VideoAskIntegration,
  form: NormalizedVideoAskForm,
  formImportId: string,
) {
  let mediaQueued = 0;

  for (const [index, question] of form.questions.entries()) {
    const media = await enqueueMedia(connection, question);
    if (media && media.status === "pending") mediaQueued += 1;
    await db
      .insert(videoaskStepImports)
      .values({
        formImportId,
        sourceQuestionId: question.id,
        sourceMediaId: question.mediaId,
        mediaImportId: media?.id ?? null,
        stepId: null,
        sortOrder: index,
        sourcePromptText: question.promptText,
        sourceTranscript: question.transcription,
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
          stepId: null,
          sortOrder: index,
          sourcePromptText: question.promptText,
          sourceTranscript: question.transcription,
          sourceSnapshot: question.source,
        },
      });
  }

  const sourceQuestionIds = form.questions.map((question) => question.id);
  if (sourceQuestionIds.length === 0) {
    await db
      .delete(videoaskStepImports)
      .where(eq(videoaskStepImports.formImportId, formImportId));
  } else {
    await db
      .delete(videoaskStepImports)
      .where(
        and(
          eq(videoaskStepImports.formImportId, formImportId),
          notInArray(videoaskStepImports.sourceQuestionId, sourceQuestionIds),
        ),
      );
  }

  return { mediaQueued };
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
  const project = await ensureSourceProject(connection, input.user);

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
    (sourceTimestampMatches(form.updatedAt, existing.sourceUpdatedAt) ||
      existing.stats.sourceFingerprint === sourceFingerprint)
  ) {
    return {
      status: "skipped",
      formImportId: existing.id,
      formId: form.id,
      formTitle: form.title,
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
      threadId: null,
      lessonId: null,
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
        threadId: null,
        lessonId: null,
        importedBy: input.user.id,
        startedAt: now,
        completedAt: null,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();

  try {
    const staged = await stageSourceSteps(connection, form, formImport.id);
    const warnings = uniqueStrings(form.warnings);

    const stats = {
      questions: form.questions.length,
      promptTexts: form.questions.filter((question) => question.promptText).length,
      transcriptions: form.questions.filter((question) => question.transcription)
        .length,
      sourceMedia: form.questions.filter((question) => question.mediaUrl).length,
      mediaQueued: staged.mediaQueued,
      logicActions: form.questions.reduce(
        (total, question) => total + question.logicEdges.length,
        0,
      ),
      warnings,
      sourceFingerprint,
    };

    await db
      .update(videoaskFormImports)
      .set({
        status: warnings.length > 0 ? "completed_with_warnings" : "completed",
        threadId: null,
        lessonId: null,
        stats,
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(videoaskFormImports.id, formImport.id));

    return {
      status: "imported",
      formImportId: formImport.id,
      formId: form.id,
      formTitle: form.title,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await db
      .update(videoaskFormImports)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(videoaskFormImports.id, formImport.id));
    throw error;
  }
}

async function refreshMediaSourceUrl(
  media: typeof videoaskMediaImports.$inferSelect,
) {
  const [mapping] = await db
    .select({ sourceFormId: videoaskFormImports.sourceFormId })
    .from(videoaskStepImports)
    .innerJoin(
      videoaskFormImports,
      eq(videoaskStepImports.formImportId, videoaskFormImports.id),
    )
    .where(eq(videoaskStepImports.mediaImportId, media.id))
    .limit(1);
  if (!mapping) {
    throw new Error("Could not locate the source VideoAsk form for this media");
  }

  const form = normalizeVideoAskForm(
    await fetchVideoAskForm(mapping.sourceFormId),
  );
  const question = form.questions.find((candidate) =>
    media.sourceMediaId
      ? candidate.mediaId === media.sourceMediaId
      : mediaKey(candidate) === media.sourceMediaKey,
  );
  if (!question?.mediaUrl) {
    throw new Error("VideoAsk no longer returned a URL for this source media");
  }

  await db
    .update(videoaskMediaImports)
    .set({ sourceUrl: question.mediaUrl, updatedAt: new Date() })
    .where(eq(videoaskMediaImports.id, media.id));
  return question.mediaUrl;
}

async function fetchMediaStream(
  media: typeof videoaskMediaImports.$inferSelect,
  signal: AbortSignal,
) {
  let response = await fetch(media.sourceUrl, {
    cache: "no-store",
    signal,
  });
  if (response.ok && response.body) return response;

  await response.body?.cancel().catch(() => undefined);
  const refreshedUrl = await refreshMediaSourceUrl(media);
  response = await fetch(refreshedUrl, { cache: "no-store", signal });
  if (!response.ok || !response.body) {
    throw new Error(
      `VideoAsk media download failed after refreshing its URL (${response.status})`,
    );
  }
  return response;
}

export async function processNextVideoAskMedia() {
  const staleBefore = new Date(Date.now() - STALE_MEDIA_PROCESSING_MS);
  const [media] = await db
    .select()
    .from(videoaskMediaImports)
    .where(
      and(
        or(
          and(
            or(
              eq(videoaskMediaImports.status, "pending"),
              eq(videoaskMediaImports.status, "failed"),
            ),
            lt(videoaskMediaImports.attempts, MAX_MEDIA_ATTEMPTS),
          ),
          and(
            eq(videoaskMediaImports.status, "processing"),
            lt(videoaskMediaImports.updatedAt, staleBefore),
            lt(videoaskMediaImports.attempts, MAX_MEDIA_ATTEMPTS),
          ),
        ),
        or(
          eq(videoaskMediaImports.storageProvider, "vercel_blob"),
          eq(videoaskMediaImports.storageProvider, "mux"),
          isNull(videoaskMediaImports.storageProvider),
        ),
      ),
    )
    .orderBy(asc(videoaskMediaImports.createdAt))
    .limit(1);

  if (!media) {
    const [failed] = await db
      .select({ value: count() })
      .from(videoaskMediaImports)
      .where(eq(videoaskMediaImports.status, "failed"));
    return { status: "empty" as const, failed: failed?.value ?? 0 };
  }

  await db
    .update(videoaskMediaImports)
    .set({
      status: "processing",
      attempts: media.attempts + 1,
      storageProvider: "vercel_blob",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(videoaskMediaImports.id, media.id));

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

    const abortSignal = AbortSignal.timeout(MEDIA_TRANSFER_TIMEOUT_MS);
    const source = await fetchMediaStream(media, abortSignal);
    const sourceBody = source.body;
    if (!sourceBody) throw new Error("VideoAsk media response had no body");
    const contentType =
      source.headers.get("content-type")?.split(";", 1)[0]?.trim() ||
      "video/mp4";
    const contentLength = source.headers.get("content-length");
    const parsedSize = contentLength ? Number(contentLength) : Number.NaN;
    const sizeBytes =
      Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : null;
    const blob = await put(
      videoAskBlobPath({
        organizationId: media.organizationId,
        sourceMediaId: media.sourceMediaId,
        sourceMediaKey: media.sourceMediaKey,
        contentType,
      }),
      sourceBody,
      {
        access: "private",
        allowOverwrite: true,
        contentType,
        multipart:
          sizeBytes === null || sizeBytes > MULTIPART_THRESHOLD_BYTES,
        token,
        abortSignal,
      },
    );

    await db
      .update(videoaskMediaImports)
      .set({
        storageProvider: "vercel_blob",
        destinationUrl: blob.url,
        contentType,
        sizeBytes,
        videoUploadId: null,
        status: "ready",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));

    return {
      status: "ready" as const,
      action: "created" as const,
      mediaId: media.id,
      destinationUrl: blob.url,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Blob media import failed";
    await db
      .update(videoaskMediaImports)
      .set({
        status: "failed",
        lastError: message.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));
    return {
      status: "failed" as const,
      action: "checked" as const,
      mediaId: media.id,
      error: message,
    };
  }
}
