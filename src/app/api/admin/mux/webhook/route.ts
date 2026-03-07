import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * Verify Mux webhook signature
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/admin/mux/webhook
 * Handle Mux webhook events.
 * Verifies signature and updates upload status.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("mux-signature");

    // Verify signature if secret is configured
    const secret = process.env.MUX_WEBHOOK_SECRET;
    if (secret && signature) {
      // Mux signature format: t=timestamp,v1=signature
      const parts = signature.split(",");
      const sigPart = parts.find((p) => p.startsWith("v1="));
      if (sigPart) {
        const sig = sigPart.replace("v1=", "");
        const timestamp = parts
          .find((p) => p.startsWith("t="))
          ?.replace("t=", "");
        const signedPayload = `${timestamp}.${payload}`;

        if (!verifySignature(signedPayload, sig, secret)) {
          console.error("Invalid webhook signature");
          return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
          );
        }
      }
    }

    const event = JSON.parse(payload);
    const { type, data } = event;

    console.log("Mux webhook event:", type);

    switch (type) {
      case "video.upload.asset_created": {
        // Upload completed, asset is being created
        const uploadId = data.id;
        const assetId = data.asset_id;

        await db
          .update(videoUploads)
          .set({
            muxAssetId: assetId,
            status: "processing",
          })
          .where(eq(videoUploads.muxUploadId, uploadId));
        break;
      }

      case "video.asset.ready": {
        // Asset is ready for playback
        const assetId = data.id;
        const playbackId = data.playback_ids?.[0]?.id;
        const duration = data.duration;

        await db
          .update(videoUploads)
          .set({
            muxPlaybackId: playbackId,
            durationSeconds: duration ? Math.round(duration) : null,
            status: "ready",
          })
          .where(eq(videoUploads.muxAssetId, assetId));
        break;
      }

      case "video.asset.errored": {
        // Asset processing failed
        const assetId = data.id;
        const errorMessage =
          data.errors?.messages?.[0] || "Processing failed";

        await db
          .update(videoUploads)
          .set({
            status: "errored",
            errorMessage,
          })
          .where(eq(videoUploads.muxAssetId, assetId));
        break;
      }

      case "video.upload.errored": {
        // Upload failed
        const uploadId = data.id;
        const errorMessage = data.error?.message || "Upload failed";

        await db
          .update(videoUploads)
          .set({
            status: "errored",
            errorMessage,
          })
          .where(eq(videoUploads.muxUploadId, uploadId));
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
