import { NextRequest, NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { mux } from "@/lib/mux";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";
import { isStaffRole } from "@/lib/platform-roles";
import { z } from "zod";

const createUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    category: z.enum(["lesson", "prompt", "other"]).default("lesson"),
    tags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  })
  .strict();

function getMuxCorsOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;
  // Safe fallback to current request origin in non-production environments.
  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }
  throw new Error("NEXT_PUBLIC_APP_URL is required in production");
}

/**
 * POST /api/admin/mux/upload-url
 * Generate a Mux direct upload URL.
 * Requires coach role minimum.
 *
 * Body: { filename: string }
 * Returns: { uploadUrl: string, uploadId: string }
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRealUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = createUploadSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid upload metadata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { filename, category, tags } = parsed.data;

    // Create Mux direct upload
    const upload = await mux.video.uploads.create({
      cors_origin: getMuxCorsOrigin(request),
      new_asset_settings: {
        // Signed-only playback: streaming requires a short-lived JWT from
        // /api/video/playback-token, so bare stream.mux.com URLs are useless.
        playback_policy: ["signed"],
        encoding_tier: "baseline",
      },
    });

    // Track upload in database
    const [record] = await db.insert(videoUploads).values({
      muxUploadId: upload.id,
      filename,
      category,
      tags,
      status: "pending",
      uploadedBy: currentUser.clerkId,
    }).returning({ id: videoUploads.id });

    return NextResponse.json({
      uploadUrl: upload.url,
      uploadId: upload.id, // Mux ID
      dbUploadId: record.id, // Database UUID
    });
  } catch (error) {
    console.error("Error creating upload URL:", error);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
