import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;
// Allow larger request bodies for video uploads (default is 4.5MB on Vercel Hobby,
// 100MB on Pro). This config is respected on Pro plans.
export const runtime = "nodejs";

/**
 * POST /api/admin/accelerator-extra/tone-mastery/upload-server
 *
 * Server-side Vercel Blob upload. Accepts a multipart form with a "file" field.
 * Bypasses the client-upload CORS/token dance that was failing with 400.
 *
 * Trade-off: file goes through our server, so subject to Vercel function body
 * size limit (4.5MB on Hobby, 100MB on Pro).
 */
export async function POST(request: NextRequest) {
  try {
    const hasAccess = await hasMinimumRole("coach");
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage not configured" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate content type
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 },
      );
    }

    // Validate file size (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 100MB)` },
        { status: 400 },
      );
    }

    // Upload to Vercel Blob using server-side put().
    // Uses private access to match the CMB Lab blob store configuration.
    // Playback happens through the /api/accelerator-extra/tone-mastery/stream/[clipId]
    // proxy endpoint which authenticates with BLOB_READ_WRITE_TOKEN.
    const blob = await put(`tone-mastery/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[Tone Mastery] Server-side upload error:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
