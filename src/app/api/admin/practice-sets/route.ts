import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { createPracticeSet, listPracticeSets } from "@/lib/practice";

/**
 * GET /api/admin/practice-sets
 * List practice sets, optionally filtered by status.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;

    const practiceSets = await listPracticeSets(
      status ? { status } : undefined
    );

    return NextResponse.json({ practiceSets });
  } catch (error) {
    console.error("Error fetching practice sets:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice sets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/practice-sets
 * Create a new practice set.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description } = body;

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Get current user's internal ID
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    const practiceSet = await createPracticeSet({
      title: title.trim(),
      description: description?.trim() || undefined,
      createdBy: user.id,
    });

    return NextResponse.json({ practiceSet }, { status: 201 });
  } catch (error) {
    console.error("Error creating practice set:", error);
    return NextResponse.json(
      { error: "Failed to create practice set" },
      { status: 500 }
    );
  }
}
