import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Edge runtime has no body size limit (Node.js serverless is capped at 4.5MB)
export const runtime = "edge";

async function checkAuth(request: NextRequest): Promise<boolean> {
  // Forward cookies to a same-origin check endpoint
  const res = await fetch(new URL("/api/admin/accelerator/settings/upload/auth", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" },
  });
  return res.ok;
}

/**
 * GET /api/admin/accelerator/settings/upload
 * Pre-flight check.
 */
export async function GET(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
  }
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/accelerator/settings/upload
 * Edge streaming upload — no body size limit.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob storage not configured." }, { status: 500 });
    }
    if (!(await checkAuth(request))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const filename = request.headers.get("x-filename") || "upload";
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    if (!request.body) {
      return NextResponse.json({ error: "No file body" }, { status: 400 });
    }

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
