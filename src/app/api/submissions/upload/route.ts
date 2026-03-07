import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

// Helper to ensure directory exists (for local storage)
async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "EEXIST") throw err;
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Basic validation
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "webm";
    const filename = `submission-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Hybrid Storage Strategy:
    // 1. If BLOB_READ_WRITE_TOKEN is present, upload to Vercel Blob (Production)
    // 2. Otherwise, save to local filesystem (Development)
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(filename, file, {
        access: 'public',
      });
      return NextResponse.json({ url: blob.url });
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Save to public/uploads/submissions
      const uploadDir = join(process.cwd(), "public/uploads/submissions");
      await ensureDir(uploadDir);
      
      const filepath = join(uploadDir, filename);
      await writeFile(filepath, buffer);

      const url = `/uploads/submissions/${filename}`;
      return NextResponse.json({ url });
    }

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
