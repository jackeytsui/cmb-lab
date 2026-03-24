import { NextRequest, NextResponse } from "next/server";
import {
  put,
  createMultipartUpload,
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
 *   complete — Finalize the upload and get the blob URL
 *   put      — Simple upload for small files (< 5 MB)
 *
 * Part uploads go to /upload-part (Edge Runtime, no body size limit).
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

    // ---- SIMPLE PUT (for small files that don't need multipart) ----
    if (action === "put") {
      const pathname = request.nextUrl.searchParams.get("pathname");
      const contentType = request.nextUrl.searchParams.get("contentType") || "audio/mpeg";

      if (!pathname) {
        return NextResponse.json({ error: "pathname required" }, { status: 400 });
      }

      const body = await request.arrayBuffer();
      const blob = await put(pathname, Buffer.from(body), {
        access: "private",
        contentType,
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
