import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons, courseLibraryModules } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  lessonType: z.enum([
    "video",
    "audio",
    "text",
    "quiz",
    "download",
    "form",
    "text_assignment",
    "listening_practice",
    "vocal_hack",
    "diary",
    "text_assignment_canto",
    "listening_practice_canto",
    "vocal_hack_canto",
    "diary_canto",
  ]),
  content: z.record(z.string(), z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ moduleId: string }>;
}

/**
 * Default instructions pre-filled into a newly-created Diary lesson so the team
 * doesn't retype them every time. Rich-text HTML (bold phrases + a bulleted
 * idea list), matching the editor's format. `language` is the language named in
 * the last idea (Mandarin vs Cantonese).
 */
function diaryDefaultDescription(language: string): string {
  return [
    "<p>Writing a diary is a great way to express yourself. Using Chinese to write one can also improve your sentence structure, word choice, and pronunciation! It might seem challenging at first, but I am sure you'll improve with practice. Start with <strong>3-4 short sentences</strong>, then try more complex structures and content later.</p>",
    "<p></p>",
    "<p>*Keep it to a <strong>maximum of 15 sentences</strong> as you only have <strong>5 minutes to record</strong> your diary.</p>",
    "<p></p>",
    "<p>Here are some ideas/ inspirations for you to write your diary:</p>",
    "<p></p>",
    "<ul>",
    "<li>What did you eat today?</li>",
    "<li>Describe your morning routine.</li>",
    "<li>Talk about your favorite hobby.</li>",
    "<li>Share a memorable moment from last week.</li>",
    "<li>Describe a place you visited recently.</li>",
    "<li>Discuss a book or movie you enjoyed.</li>",
    "<li>Describe your plans for the upcoming weekend.</li>",
    "<li>Talk about a goal you've set for yourself.</li>",
    "<li>Describe a recent challenge you've overcome.</li>",
    `<li>Share your thoughts on learning ${language}.</li>`,
    "</ul>",
    "<p></p>",
    "<p>Our coaches will provide feedback!</p>",
  ].join("");
}

/**
 * POST /api/admin/course-library/modules/[moduleId]/lessons
 * Create a new lesson inside a module. Content may be empty initially;
 * the admin fills it in via the lesson editor form.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  // Verify module exists
  const [mod] = await db
    .select({ id: courseLibraryModules.id })
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .limit(1);
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Provide a sane default content shape per type
  const defaultContent: Record<string, Record<string, unknown>> = {
    video: { videoUrl: "", description: "" },
    audio: { audioUrl: "", description: "" },
    text: { body: "" },
    quiz: { passingScore: 70, questions: [] },
    download: { fileUrl: "", fileName: "", sizeBytes: 0 },
    form: { embedUrl: "", embedHeight: 600 },
    text_assignment: {
      description: "",
      sentencePrompts: [
        {
          id: crypto.randomUUID(),
          label: "Sentence 1",
          description: "",
          order: 0,
        },
      ],
    },
    text_assignment_canto: {
      description: "",
      sentencePrompts: [
        {
          id: crypto.randomUUID(),
          label: "Sentence 1",
          description: "",
          order: 0,
        },
      ],
    },
    diary: { description: diaryDefaultDescription("Mandarin") },
    diary_canto: { description: diaryDefaultDescription("Cantonese") },
  };

  // Next sort order
  const siblings = await db
    .select({ sortOrder: courseLibraryLessons.sortOrder })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.moduleId, moduleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    );
  const nextSort =
    siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0;

  let lesson;
  try {
    [lesson] = await db
      .insert(courseLibraryLessons)
      .values({
        moduleId,
        title: parsed.data.title,
        lessonType: parsed.data.lessonType,
        content: parsed.data.content ?? defaultContent[parsed.data.lessonType],
        sortOrder: nextSort,
      })
      .returning();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      parsed.data.lessonType === "form" &&
      (message.includes("course_library_lesson_type") || message.includes("form"))
    ) {
      return NextResponse.json(
        {
          error:
            "Form Embed lesson type is not available yet. Run the course-library migration that adds the form enum value.",
        },
        { status: 409 },
      );
    }
    if (
      parsed.data.lessonType === "text_assignment" &&
      (message.includes("course_library_lesson_type") ||
        message.includes("text_assignment"))
    ) {
      return NextResponse.json(
        {
          error:
            "Text Assignment lesson type is not available yet. Run the migration that adds the text_assignment enum value.",
        },
        { status: 409 },
      );
    }
    console.error("Failed to create course-library lesson:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 },
    );
  }

  return NextResponse.json({ lesson }, { status: 201 });
}
