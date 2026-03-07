import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { vocabularyLists, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const lists = await db
      .select()
      .from(vocabularyLists)
      .where(eq(vocabularyLists.userId, currentUser.id))
      .orderBy(desc(vocabularyLists.updatedAt));

    return NextResponse.json({ lists });
  } catch (error) {
    console.error("Failed to fetch vocabulary lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch lists" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const json = await request.json();
    const { name, description } = createListSchema.parse(json);

    const [newList] = await db
      .insert(vocabularyLists)
      .values({
        userId: currentUser.id,
        name,
        description,
      })
      .returning();

    return NextResponse.json({ list: newList });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to create vocabulary list:", error);
    return NextResponse.json(
      { error: "Failed to create list" },
      { status: 500 }
    );
  }
}
