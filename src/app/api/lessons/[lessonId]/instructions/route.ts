import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buildLessonInstructions } from "@/lib/lesson-context";
import type { LanguagePreference } from "@/lib/interactions";

/**
 * GET /api/lessons/[lessonId]/instructions?lang=cantonese|mandarin|both
 * Returns AI tutor instructions built from lesson context.
 * Used by the VoiceConversation client component.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const lang = (request.nextUrl.searchParams.get("lang") || "both") as LanguagePreference;

  const instructions = await buildLessonInstructions(lessonId, lang);
  return NextResponse.json({ instructions });
}
