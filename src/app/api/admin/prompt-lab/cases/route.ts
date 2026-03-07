import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { promptLabCases } from "@/db/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cases = await db.query.promptLabCases.findMany({
    where: eq(promptLabCases.userId, user.id),
    orderBy: [asc(promptLabCases.createdAt)],
  });

  return NextResponse.json({ cases });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    title?: string;
    input?: string;
    expectedPattern?: string;
  };

  if (!body.title?.trim() || !body.input?.trim()) {
    return NextResponse.json({ error: "title and input are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(promptLabCases)
    .values({
      userId: user.id,
      title: body.title.trim(),
      input: body.input,
      expectedPattern: body.expectedPattern?.trim() || null,
    })
    .returning();

  return NextResponse.json({ case: created }, { status: 201 });
}
