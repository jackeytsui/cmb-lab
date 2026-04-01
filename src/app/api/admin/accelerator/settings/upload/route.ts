import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

/**
 * GET /api/admin/accelerator/settings/upload
 * Pre-flight check — verifies auth + blob token before upload starts.
 */
export async function GET() {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured. Ask admin to set BLOB_READ_WRITE_TOKEN." },
        { status: 500 },
      );
    }

    const hasRoleAccess = await hasMinimumRole("coach");
    if (!hasRoleAccess) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Upload pre-flight check failed:", err);
    return NextResponse.json(
      { error: `Pre-flight check failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/accelerator/settings/upload
 * Server-side upload: receives file via FormData, uploads to Vercel Blob.
 * This avoids CORS issues with client-side uploads on custom domains.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured." },
        { status: 500 },
      );
    }

    const hasRoleAccess = await hasMinimumRole("coach");
    if (!hasRoleAccess) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const blob = await put(`accelerator/${file.name}`, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type || "application/octet-stream",
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
