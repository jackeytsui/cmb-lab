import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbEntries, kbFileSources, kbChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractTextFromPdf, chunkText } from "@/lib/chunking";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/admin/knowledge/entries/[entryId]/upload
 * Upload a PDF file to a knowledge entry.
 * Extracts text, chunks it, and stores in kbFileSources and kbChunks.
 * Requires coach role minimum.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { entryId } = await params;

    // Verify entry exists
    const entry = await db.query.kbEntries.findFirst({
      where: eq(kbEntries.id, entryId),
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Knowledge entry not found" },
        { status: 404 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type (v1: PDF only)
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large, max 10MB" },
        { status: 400 }
      );
    }

    // Read file as Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate storage key and save to disk
    const storageKey = `uploads/kb/${entryId}/${crypto.randomUUID()}.pdf`;
    const fullPath = path.join(process.cwd(), "public", storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    // Attempt text extraction and chunking
    let extractedText = "";
    let chunks: string[] = [];
    let processingWarning: string | undefined;

    try {
      extractedText = await extractTextFromPdf(buffer);
      chunks = chunkText(extractedText);
    } catch (extractError) {
      console.error("PDF text extraction failed:", extractError);
      processingWarning =
        "PDF text extraction failed. File saved but no chunks were created.";
    }

    // Insert file source record
    const [fileSource] = await db
      .insert(kbFileSources)
      .values({
        entryId,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storageKey,
        processedAt: chunks.length > 0 ? new Date() : null,
        chunkCount: chunks.length,
      })
      .returning();

    // Insert chunks if any were created
    if (chunks.length > 0) {
      const chunkRecords = chunks.map((content, i) => ({
        entryId,
        fileSourceId: fileSource.id,
        content,
        chunkIndex: i,
      }));

      await db.insert(kbChunks).values(chunkRecords);
    }

    return NextResponse.json(
      {
        fileSource,
        chunkCount: chunks.length,
        ...(processingWarning && { warning: processingWarning }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
