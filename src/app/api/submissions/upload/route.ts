import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { db } from "@/db";
import { studentMediaUploads } from "@/db/schema";
import { getRealUser } from "@/lib/auth";

// Helper to ensure directory exists (for local storage)
async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "EEXIST") throw err;
  }
}

export async function POST(request: NextRequest) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Basic validation
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) { // 50MB limit
      return NextResponse.json(
        { error: "File must be between 1 byte and 50MB" },
        { status: 400 },
      );
    }

    const contentType = file.type.split(";")[0].trim().toLowerCase();
    const extensionByType: Record<string, string> = {
      "audio/webm": "webm",
      "video/webm": "webm",
      "audio/mp4": "m4a",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const ext = extensionByType[contentType];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported audio or video format" },
        { status: 415 },
      );
    }
    const filename = `student-submissions/${user.id}/${crypto.randomUUID()}.${ext}`;

    // Hybrid Storage Strategy:
    // 1. If BLOB_READ_WRITE_TOKEN is present, upload to Vercel Blob (Production)
    // 2. Otherwise, save to local filesystem (Development)
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(filename, file, {
        access: "private",
        addRandomSuffix: true,
        contentType,
      });
      const [upload] = await db
        .insert(studentMediaUploads)
        .values({
          userId: user.id,
          blobUrl: blob.url,
          contentType,
          sizeBytes: file.size,
        })
        .returning({ id: studentMediaUploads.id });
      return NextResponse.json({ url: `/api/submissions/media/${upload.id}` });
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Save to public/uploads/submissions
      const uploadDir = join(process.cwd(), "public/uploads/submissions");
      await ensureDir(uploadDir);
      
      const localFilename = filename.split("/").pop()!;
      const filepath = join(uploadDir, localFilename);
      await writeFile(filepath, buffer);

      const url = `/uploads/submissions/${localFilename}`;
      const [upload] = await db
        .insert(studentMediaUploads)
        .values({
          userId: user.id,
          blobUrl: url,
          contentType,
          sizeBytes: file.size,
        })
        .returning({ id: studentMediaUploads.id });
      return NextResponse.json({ url: `/api/submissions/media/${upload.id}` });
    }

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
