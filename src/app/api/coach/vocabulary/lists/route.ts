import { NextResponse } from "next/server";
import { db } from "@/db";
import { vocabularyLists, vocabularyListAssignments } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { z } from "zod";
import { isStaffRole } from "@/lib/platform-roles";

const createListSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2_000).optional(),
});

export async function GET() {
  const currentUser = await getRealUser();
  if (!currentUser) return new NextResponse("Unauthorized", { status: 401 });
  if (!isStaffRole(currentUser.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Get lists created by this coach + count of assignments
  const lists = await db
    .select({
      id: vocabularyLists.id,
      name: vocabularyLists.name,
      description: vocabularyLists.description,
      createdAt: vocabularyLists.createdAt,
      updatedAt: vocabularyLists.updatedAt,
      assignmentCount: sql<number>`count(${vocabularyListAssignments.id})`.mapWith(Number),
    })
    .from(vocabularyLists)
    .leftJoin(
      vocabularyListAssignments,
      eq(vocabularyListAssignments.listId, vocabularyLists.id)
    )
    .where(eq(vocabularyLists.userId, currentUser.id))
    .groupBy(vocabularyLists.id)
    .orderBy(desc(vocabularyLists.createdAt));

  return NextResponse.json({ lists });
}

export async function POST(req: Request) {
  const currentUser = await getRealUser();
  if (!currentUser) return new NextResponse("Unauthorized", { status: 401 });
  if (!isStaffRole(currentUser.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = createListSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid list" }, { status: 400 });
  }
  const { name, description } = parsed.data;

  const [newList] = await db
    .insert(vocabularyLists)
    .values({
      userId: currentUser.id,
      name,
      description,
    })
    .returning();

  return NextResponse.json({ list: newList });
}
