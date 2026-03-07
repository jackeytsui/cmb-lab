import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { mux } from "@/lib/mux";
import { db } from "@/db";
import { videoUploads, videoThreads } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

function getMuxCorsOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }
  throw new Error("NEXT_PUBLIC_APP_URL is required in production");
}

/**
 * POST /api/video-threads/[threadId]/upload-response
 * Student-accessible Mux upload endpoint. Two actions:
 *   - "get-upload-url": Create a Mux direct upload URL
 *   - "check-status": Poll upload/asset status
 *
 * No role gate -- any authenticated user can upload responses.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Student-level auth (no role gate)
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await params;
    const body = await request.json();
    const { action } = body;

    if (!action || !["get-upload-url", "check-status"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'get-upload-url' or 'check-status'" },
        { status: 400 }
      );
    }

    // Verify thread exists
    const thread = await db.query.videoThreads.findFirst({
      where: eq(videoThreads.id, threadId),
      columns: { id: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (action === "get-upload-url") {
      return handleGetUploadUrl(body, user, threadId, request);
    }

    // action === "check-status"
    return handleCheckStatus(body, user);
  } catch (error) {
    console.error("Error in upload-response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── get-upload-url ──────────────────────────────────────────────────────────

async function handleGetUploadUrl(
  body: { filename?: string },
  user: { id: string; clerkId: string },
  threadId: string,
  request: NextRequest
) {
  const { filename } = body;

  if (!filename || typeof filename !== "string") {
    return NextResponse.json(
      { error: "filename is required" },
      { status: 400 }
    );
  }

  // Create Mux direct upload
  const upload = await mux.video.uploads.create({
    cors_origin: getMuxCorsOrigin(request),
    new_asset_settings: {
      playback_policy: ["public"],
      encoding_tier: "baseline",
    },
  });

  // Track upload in database
  // Note: uploadedBy references users.clerkId (text), not users.id (uuid)
  const [record] = await db
    .insert(videoUploads)
    .values({
      muxUploadId: upload.id,
      filename,
      category: "other", // "response" not in enum; using "other" for student responses
      tags: ["response", `thread:${threadId}`],
      status: "pending",
      uploadedBy: user.clerkId,
    })
    .returning({ id: videoUploads.id });

  return NextResponse.json({
    uploadUrl: upload.url,
    uploadId: upload.id, // Mux upload ID
    dbUploadId: record.id, // Database UUID
  });
}

// ─── check-status ────────────────────────────────────────────────────────────

async function handleCheckStatus(
  body: { uploadId?: string },
  user: { id: string; clerkId: string }
) {
  const { uploadId } = body;

  if (!uploadId || typeof uploadId !== "string") {
    return NextResponse.json(
      { error: "uploadId is required" },
      { status: 400 }
    );
  }

  // Verify the upload record belongs to the requesting user
  const uploadRecord = await db.query.videoUploads.findFirst({
    where: and(
      eq(videoUploads.muxUploadId, uploadId),
      eq(videoUploads.uploadedBy, user.clerkId)
    ),
  });

  if (!uploadRecord) {
    return NextResponse.json(
      { error: "Upload not found or access denied" },
      { status: 404 }
    );
  }

  // Check upload status on Mux
  const upload = await mux.video.uploads.retrieve(uploadId);

  if (
    upload.status === "waiting" ||
    (upload.status as string) === "uploading"
  ) {
    return NextResponse.json({ status: "uploading" });
  }

  if (upload.status === "errored") {
    await db
      .update(videoUploads)
      .set({ status: "errored", errorMessage: "Upload failed on Mux" })
      .where(eq(videoUploads.muxUploadId, uploadId));
    return NextResponse.json({ status: "errored" });
  }

  // Upload completed -- check asset status
  const assetId = upload.asset_id;
  if (!assetId) {
    return NextResponse.json({ status: "processing" });
  }

  const asset = await mux.video.assets.retrieve(assetId);
  const playbackId = asset.playback_ids?.[0]?.id;
  const duration = asset.duration ? Math.round(asset.duration) : null;

  if (asset.status === "ready") {
    await db
      .update(videoUploads)
      .set({
        muxAssetId: assetId,
        muxPlaybackId: playbackId ?? null,
        durationSeconds: duration,
        status: "ready",
      })
      .where(eq(videoUploads.muxUploadId, uploadId));

    return NextResponse.json({
      status: "ready",
      muxAssetId: assetId,
      muxPlaybackId: playbackId,
      durationSeconds: duration,
    });
  }

  if (asset.status === "errored") {
    const errorMessage =
      asset.errors?.messages?.[0] || "Asset processing failed";
    await db
      .update(videoUploads)
      .set({
        muxAssetId: assetId,
        status: "errored",
        errorMessage,
      })
      .where(eq(videoUploads.muxUploadId, uploadId));
    return NextResponse.json({ status: "errored", errorMessage });
  }

  // Still processing
  await db
    .update(videoUploads)
    .set({ muxAssetId: assetId, status: "processing" })
    .where(eq(videoUploads.muxUploadId, uploadId));

  return NextResponse.json({ status: "processing" });
}
