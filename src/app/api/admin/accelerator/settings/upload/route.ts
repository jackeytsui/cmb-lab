import { NextRequest, NextResponse } from "next/server";
import {
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
} from "@vercel/blob";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

async function checkAuth(): Promise<boolean> {
  const hasRoleAccess = await hasMinimumRole("coach");
  if (hasRoleAccess) return true;
  const user = await getCurrentUser();
  return !!user;
}

/**
 * GET — preflight check
 */
export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
  }
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * POST — handles three actions for chunked upload:
 *   1. action=create  → start multipart upload
 *   2. action=part    → upload one chunk
 *   3. action=complete → finalize upload
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
    }
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const action = request.headers.get("x-action");
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    // Step 1: Create multipart upload
    if (action === "create") {
      const { pathname, contentType } = await request.json();
      const mpu = await createMultipartUpload(pathname, {
        access: "public",
        token,
        contentType: contentType || "application/octet-stream",
      });
      return NextResponse.json({
        uploadId: mpu.uploadId,
        key: mpu.key,
      });
    }

    // Step 2: Upload a chunk
    if (action === "part") {
      const uploadId = request.headers.get("x-upload-id")!;
      const key = request.headers.get("x-key")!;
      const partNumber = Number(request.headers.get("x-part-number"));

      if (!request.body) {
        return NextResponse.json({ error: "No body" }, { status: 400 });
      }

      // Read the chunk body (< 4MB so within limit)
      const body = await request.arrayBuffer();

      const part = await uploadPart(key, body, {
        access: "public",
        token,
        uploadId,
        partNumber,
      });

      return NextResponse.json({ etag: part.etag });
    }

    // Step 3: Complete multipart upload
    if (action === "complete") {
      const { key, uploadId, parts } = await request.json();
      const blob = await completeMultipartUpload(key, uploadId, parts, {
        access: "public",
        token,
      });
      return NextResponse.json({ url: blob.url });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}
