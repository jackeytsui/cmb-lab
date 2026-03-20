import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { getLessonPracticeSet, updatePracticeSet } from "@/lib/practice";

/**
 * PUT /api/admin/audio-course/lessons/[lessonId]/exercises-status
 * Publish or unpublish the lesson's practice set.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  const body = (await request.json()) as { status: "draft" | "published" };

  if (!body.status || !["draft", "published"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const practiceSet = await getLessonPracticeSet(lessonId);
  if (!practiceSet) {
    return NextResponse.json({ error: "No exercises found for this lesson" }, { status: 404 });
  }

  const updated = await updatePracticeSet(practiceSet.id, { status: body.status });
  return NextResponse.json({ practiceSet: updated });
}
