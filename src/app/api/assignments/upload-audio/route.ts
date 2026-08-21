import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getRealUser } from "@/lib/auth";

export const maxDuration = 60;

const MAX_BYTES = 50_000_000; // 50 MB
const ALLOWED_TYPES = new Set([
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
  "video/webm",
]);

/**
 * POST /api/assignments/upload-audio
 * Authenticated upload for:
 *   - Student recordings (vocal hack, diary challenge)
 *   - Admin-uploaded listening practice audio
 * Body: multipart/form-data { file, prefix }
 * prefix must be 'assignment-recordings/' or 'listening-practice/'
 */
export async function POST(request: NextRequest) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const prefix = form.get("prefix");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (
    typeof prefix !== "string" ||
    (prefix !== "assignment-recordings/" && prefix !== "listening-practice/")
  ) {
    return NextResponse.json(
      { error: "prefix must be 'assignment-recordings/' or 'listening-practice/'" },
      { status: 400 },
    );
  }
  if (prefix === "listening-practice/" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be between 1 byte and 50 MB" },
      { status: file.size > MAX_BYTES ? 413 : 400 },
    );
  }

  // MediaRecorder reports the codec too (e.g. "audio/webm;codecs=opus"), so
  // strip parameters and normalise before the allow-list check.
  const contentType = (file.type || "audio/webm")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 415 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "webm";
    const blob = await put(`${prefix}${user.id}/${crypto.randomUUID()}.${extension}`, buffer, {
      access: "private",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
