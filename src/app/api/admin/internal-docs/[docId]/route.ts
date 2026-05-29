import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { internalDocs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.any().optional(),
  order: z.number().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { docId } = await params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.content !== undefined) updates.content = parsed.data.content;
    if (parsed.data.order !== undefined) updates.order = parsed.data.order;
    updates.updatedAt = new Date();

    const [doc] = await db
      .update(internalDocs)
      .set(updates)
      .where(eq(internalDocs.id, docId))
      .returning();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ doc });
  } catch (error) {
    console.error("Error updating internal doc:", error);
    return NextResponse.json({ error: "Failed to update doc" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { docId } = await params;

  try {
    await db.delete(internalDocs).where(eq(internalDocs.id, docId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting internal doc:", error);
    return NextResponse.json({ error: "Failed to delete doc" }, { status: 500 });
  }
}
