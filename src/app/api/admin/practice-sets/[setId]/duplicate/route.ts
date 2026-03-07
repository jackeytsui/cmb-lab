import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { duplicatePracticeSet } from "@/lib/practice";

interface RouteParams {
  params: Promise<{ setId: string }>;
}

/**
 * POST /api/admin/practice-sets/[setId]/duplicate
 * Create a copy of a practice set with all its exercises.
 * The copy gets a "(Copy)" suffix and starts as draft.
 * Requires coach role.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { setId } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const result = await duplicatePracticeSet(setId, user.id);

    if (!result) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { practiceSet: result.practiceSet, exercises: result.exercises },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error duplicating practice set:", error);
    return NextResponse.json(
      { error: "Failed to duplicate practice set" },
      { status: 500 }
    );
  }
}
