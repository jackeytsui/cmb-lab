import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

// Increase body size limit for this route (Vercel default is 4.5MB)
export const runtime = "nodejs";

async function checkAuth(): Promise<boolean> {
  const hasRoleAccess = await hasMinimumRole("coach");
  if (hasRoleAccess) return true;
  const user = await getCurrentUser();
  return !!user;
}

/**
 * GET /api/admin/accelerator/settings/upload
 * Pre-flight check — verifies auth + blob token.
 */
export async function GET() {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured." },
        { status: 500 },
      );
    }
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Preflight failed:", err);
    return NextResponse.json({ error: "Preflight failed" }, { status: 500 });
  }
}

/**
 * POST /api/admin/accelerator/settings/upload
 * Server-side streaming upload to Vercel Blob.
 * Streams the request body directly to avoid the 4.5MB body limit.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
    }
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get filename and content type from headers
    const filename = request.headers.get("x-filename") || "upload";
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    if (!request.body) {
      return NextResponse.json({ error: "No file body" }, { status: 400 });
    }

    // Stream body directly to Vercel Blob — no buffering
    const blob = await put(`accelerator/${filename}`, request.body, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}
