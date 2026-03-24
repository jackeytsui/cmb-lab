import { NextRequest, NextResponse } from "next/server";
import {
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
} from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN!;

async function checkAuth(): Promise<NextResponse | null> {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * POST /api/admin/audio-course/upload-multipart
 *
 * Actions (via ?action= query param):
 *   create   — Start a multipart upload session
 *   part     — Upload a single part (body = raw binary chunk)
 *   complete — Finalize the upload and get the blob URL
 */
export async function POST(request: NextRequest) {
  const authErr = await checkAuth();
  if (authErr) return authErr;

  const action = request.nextUrl.searchParams.get("action");

  try {
    // ---- CREATE ----
    if (action === "create") {
      const { pathname, contentType } = await request.json();
      if (!pathname || typeof pathname !== "string") {
        return NextResponse.json({ error: "pathname required" }, { status: 400 });
      }

      const result = await createMultipartUpload(pathname, {
        access: "private",
        contentType: contentType || "audio/mpeg",
        token: BLOB_TOKEN(),
      });

      return NextResponse.json({
        uploadId: result.uploadId,
        key: result.key,
      });
    }

    // ---- UPLOAD PART ----
    if (action === "part") {
      const pathname = request.nextUrl.searchParams.get("pathname");
      const uploadId = request.nextUrl.searchParams.get("uploadId");
      const key = request.nextUrl.searchParams.get("key");
      const partNumber = Number(request.nextUrl.searchParams.get("partNumber"));

      if (!pathname || !uploadId || !key || !partNumber) {
        return NextResponse.json(
          { error: "pathname, uploadId, key, partNumber required" },
          { status: 400 },
        );
      }

      // Read the raw binary body (the chunk)
      const body = await request.arrayBuffer();

      const result = await uploadPart(pathname, Buffer.from(body), {
        access: "private",
        uploadId,
        key,
        partNumber,
        token: BLOB_TOKEN(),
      });

      return NextResponse.json({
        etag: result.etag,
        partNumber: result.partNumber,
      });
    }

    // ---- COMPLETE ----
    if (action === "complete") {
      const { pathname, uploadId, key, parts } = await request.json();

      if (!pathname || !uploadId || !key || !Array.isArray(parts)) {
        return NextResponse.json(
          { error: "pathname, uploadId, key, parts[] required" },
          { status: 400 },
        );
      }

      const blob = await completeMultipartUpload(pathname, parts, {
        access: "private",
        uploadId,
        key,
        token: BLOB_TOKEN(),
      });

      return NextResponse.json({ url: blob.url });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(`[upload-multipart] action=${action} failed:`, err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
