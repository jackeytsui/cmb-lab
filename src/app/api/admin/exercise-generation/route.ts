import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { practiceSets, practiceExercises } from "@/db/schema";
import type { ExerciseDefinition } from "@/types/exercises";

function localFallbackExercises(sourceText: string) {
  const snippet = sourceText.slice(0, 120);
  return [
    {
      type: "fill_in_blank",
      language: "both" as const,
      definition: {
        type: "fill_in_blank",
        sentence: `${snippet} {{blank}}`,
        blanks: [{ id: "b1", correctAnswer: "答案" }],
        explanation: "Generated fallback cloze from source text.",
      },
    },
    {
      type: "multiple_choice",
      language: "both" as const,
      definition: {
        type: "multiple_choice",
        question: "Which summary best matches the source text?",
        options: [
          { id: "a", text: "Core idea and context" },
          { id: "b", text: "Unrelated topic" },
          { id: "c", text: "Random vocabulary list" },
        ],
        correctOptionId: "a",
      },
    },
  ];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    sourceText?: string;
    title?: string;
    saveAsDraft?: boolean;
  };

  if (!body.sourceText?.trim()) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_EXERCISE_GEN_WEBHOOK_URL;
  let generatedExercises: Array<{
    type: string;
    language: "cantonese" | "mandarin" | "both";
    definition: ExerciseDefinition;
  }> = [];

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: body.sourceText, title: body.title }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const data = await response.json();
        generatedExercises = data.exercises ?? [];
      }
    } catch (error) {
      console.error("Exercise generation webhook failed:", error);
    }
  }

  if (!generatedExercises.length) {
    generatedExercises = localFallbackExercises(body.sourceText) as Array<{
      type: string;
      language: "cantonese" | "mandarin" | "both";
      definition: ExerciseDefinition;
    }>;
  }

  if (!body.saveAsDraft) {
    return NextResponse.json({ exercises: generatedExercises, saved: false });
  }

  const [set] = await db
    .insert(practiceSets)
    .values({
      title: body.title?.trim() || "AI Generated Draft Set",
      description: "Auto-generated draft. Review before publishing.",
      status: "draft",
      createdBy: user.id,
    })
    .returning();

  await db.insert(practiceExercises).values(
    generatedExercises.map((exercise, idx) => ({
      practiceSetId: set.id,
      type: exercise.type as
        | "multiple_choice"
        | "fill_in_blank"
        | "matching"
        | "ordering"
        | "audio_recording"
        | "free_text"
        | "video_recording",
      language: exercise.language,
      definition: exercise.definition as ExerciseDefinition,
      sortOrder: idx,
    }))
  );

  return NextResponse.json({ exercises: generatedExercises, saved: true, practiceSetId: set.id });
}
