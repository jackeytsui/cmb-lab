import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

const MAX_AUDIO_SIZE_BYTES = 50_000_000; // 50MB
const PATHNAME_PREFIX = "conversation-scripts/";
const ALLOWED_AUDIO_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/webm",
]);

function isValidPathname(pathname: string): boolean {
  return pathname.startsWith(PATHNAME_PREFIX) && !pathname.includes("..");
}

async function checkAuth(): Promise<NextResponse | null> {
  const hasRoleAccess = await hasMinimumRole("coach");
  if (hasRoleAccess) return null;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/admin/accelerator/scripts/upload
 * Pre-flight check — verifies auth + blob token are working.
 */
export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured. Ask admin to set BLOB_READ_WRITE_TOKEN." },
      { status: 500 }
    );
  }
  const authErr = await checkAuth();
  if (authErr) return authErr;
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/accelerator/scripts/upload
 * Server-side upload of conversation-script audio to Vercel Blob (private access).
 * Body: multipart/form-data with fields:
 *   - file: audio file
 *   - pathname: target path (must start with "conversation-scripts/")
 *
 * The CMB Lab Blob store is private-only; we cannot use @vercel/blob/client's
 * client-upload flow (which requires public access). Routing through the server
 * with access: "private" matches the pattern used elsewhere in this codebase.
 */
export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured. Ask admin to set BLOB_READ_WRITE_TOKEN." },
      { status: 500 }
    );
  }

  const authErr = await checkAuth();
  if (authErr) return authErr;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const pathname = form.get("pathname");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (typeof pathname !== "string" || !isValidPathname(pathname)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_AUDIO_SIZE_BYTES} bytes` },
      { status: 413 }
    );
  }

  const contentType = file.type || "audio/mpeg";
  if (!ALLOWED_AUDIO_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 415 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(pathname, buffer, {
      access: "private",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Script audio upload failed:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
