import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { internalDocs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { docId } = await params;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` },
      { status: 400 }
    );
  }

  const doc = await db.query.internalDocs.findFirst({
    where: eq(internalDocs.id, docId),
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blob = await put(`internal-docs/${docId}/${file.name}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: "application/pdf",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const existing = (doc.attachments as { name: string; url: string }[] | null) ?? [];
  const updated = [...existing, { name: file.name, url: blob.url }];

  const [saved] = await db
    .update(internalDocs)
    .set({ attachments: updated, updatedAt: new Date() })
    .where(eq(internalDocs.id, docId))
    .returning();

  return NextResponse.json({ doc: saved }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { docId } = await params;
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const doc = await db.query.internalDocs.findFirst({
    where: eq(internalDocs.id, docId),
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    // Blob may already be gone — continue to update DB
  }

  const existing = (doc.attachments as { name: string; url: string }[] | null) ?? [];
  const updated = existing.filter((a) => a.url !== url);

  const [saved] = await db
    .update(internalDocs)
    .set({ attachments: updated, updatedAt: new Date() })
    .where(eq(internalDocs.id, docId))
    .returning();

  return NextResponse.json({ doc: saved });
}
