import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vocabularyLists, users, vocabularyListAssignments } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return new NextResponse("Unauthorized", { status: 401 });

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) return new NextResponse("User not found", { status: 404 });

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
  const { userId: clerkId } = await auth();
  if (!clerkId) return new NextResponse("Unauthorized", { status: 401 });

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (!currentUser) return new NextResponse("User not found", { status: 404 });

  const { name, description } = await req.json();
  if (!name) return new NextResponse("Name is required", { status: 400 });

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
