import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { grammarBookmarks } from "@/db/schema";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { patternId } = await params;

  const [existing] = await db
    .select()
    .from(grammarBookmarks)
    .where(and(eq(grammarBookmarks.userId, user.id), eq(grammarBookmarks.patternId, patternId)));

  if (!existing) {
    await db.insert(grammarBookmarks).values({ userId: user.id, patternId });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { patternId } = await params;

  await db
    .delete(grammarBookmarks)
    .where(and(eq(grammarBookmarks.userId, user.id), eq(grammarBookmarks.patternId, patternId)));

  return NextResponse.json({ success: true });
}
