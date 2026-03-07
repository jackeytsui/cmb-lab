import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { interactions, lessons } from "@/db/schema";
import { eq, isNull, asc, and } from "drizzle-orm";

/**
 * GET /api/admin/interactions
 * List interactions for a lessonId (query param), ordered by timestamp ASC.
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lessonId");

    if (!lessonId) {
      return NextResponse.json(
        { error: "lessonId query parameter is required" },
        { status: 400 }
      );
    }

    const interactionList = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.lessonId, lessonId), isNull(interactions.deletedAt)))
      .orderBy(asc(interactions.timestamp));

    return NextResponse.json({ interactions: interactionList });
  } catch (error) {
    console.error("Error fetching interactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch interactions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/interactions
 * Create a new interaction.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      lessonId,
      timestamp,
      type,
      language,
      prompt,
      expectedAnswer,
      correctThreshold,
      sortOrder,
    } = body;

    // Validate required fields
    if (!lessonId) {
      return NextResponse.json(
        { message: "lessonId is required" },
        { status: 400 }
      );
    }

    // Validate timestamp is positive integer
    if (typeof timestamp !== "number" || timestamp < 0 || !Number.isInteger(timestamp)) {
      return NextResponse.json(
        { message: "Timestamp must be a positive integer" },
        { status: 400 }
      );
    }

    // Validate type enum
    const validTypes = ["text", "audio"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { message: "Type must be 'text' or 'audio'" },
        { status: 400 }
      );
    }

    // Validate language enum
    const validLanguages = ["cantonese", "mandarin", "both"];
    if (!validLanguages.includes(language)) {
      return NextResponse.json(
        { message: "Language must be 'cantonese', 'mandarin', or 'both'" },
        { status: 400 }
      );
    }

    // Validate prompt
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return NextResponse.json(
        { message: "Prompt must be at least 5 characters" },
        { status: 400 }
      );
    }

    // Validate correctThreshold if provided
    const threshold = correctThreshold ?? 80;
    if (typeof threshold !== "number" || threshold < 0 || threshold > 100) {
      return NextResponse.json(
        { message: "Correct threshold must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Verify lesson exists
    const [lesson] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ message: "Lesson not found" }, { status: 404 });
    }

    // Get max sortOrder if not provided
    let orderValue = sortOrder;
    if (orderValue === undefined || orderValue === null) {
      const maxOrder = await db
        .select({ max: interactions.sortOrder })
        .from(interactions)
        .where(and(eq(interactions.lessonId, lessonId), isNull(interactions.deletedAt)));
      orderValue = (maxOrder[0]?.max ?? -1) + 1;
    }

    const [newInteraction] = await db
      .insert(interactions)
      .values({
        lessonId,
        timestamp,
        type,
        language,
        prompt: prompt.trim(),
        expectedAnswer: expectedAnswer?.trim() || null,
        correctThreshold: threshold,
        sortOrder: orderValue,
      })
      .returning();

    return NextResponse.json({ interaction: newInteraction }, { status: 201 });
  } catch (error) {
    console.error("Error creating interaction:", error);
    return NextResponse.json(
      { message: "Failed to create interaction" },
      { status: 500 }
    );
  }
}
