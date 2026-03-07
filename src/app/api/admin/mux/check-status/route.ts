import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { mux } from "@/lib/mux";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/mux/check-status
 * Poll Mux for upload/asset status and update the database.
 * Used when webhooks can't reach the server (e.g. localhost).
 *
 * Body: { uploadId: string }
 * Returns: { status, muxAssetId?, muxPlaybackId?, durationSeconds? }
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { uploadId } = await request.json();

    if (!uploadId || typeof uploadId !== "string") {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    // Check upload status on Mux
    const upload = await mux.video.uploads.retrieve(uploadId);

    if (upload.status === "waiting" || (upload.status as string) === "uploading") {
      return NextResponse.json({ status: "uploading" });
    }

    if (upload.status === "errored") {
      await db
        .update(videoUploads)
        .set({ status: "errored", errorMessage: "Upload failed on Mux" })
        .where(eq(videoUploads.muxUploadId, uploadId));
      return NextResponse.json({ status: "errored" });
    }

    // Upload completed — check asset status
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
  } catch (error) {
    console.error("Error checking upload status:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
