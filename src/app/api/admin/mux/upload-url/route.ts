import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { mux } from "@/lib/mux";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";

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
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, category, tags } = body;

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
    const [record] = await db.insert(videoUploads).values({
      muxUploadId: upload.id,
      filename,
      category: category || "lesson",
      tags: tags || [],
      status: "pending",
      uploadedBy: userId,
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
