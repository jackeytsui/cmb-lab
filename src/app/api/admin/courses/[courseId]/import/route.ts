import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courses,
  lessonAttachments,
  lessons,
  modules,
  practiceExercises,
  practiceSetAssignments,
  practiceSets,
} from "@/db/schema";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { exerciseDefinitionSchema } from "@/types/exercises";

const languageSchema = z.enum(["cantonese", "mandarin", "both"]).default("both");

const exerciseImportSchema = z.object({
  language: languageSchema.optional(),
  definition: exerciseDefinitionSchema,
});

const assessmentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  exercises: z.array(exerciseImportSchema).default([]),
});

const attachmentSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  type: z.enum(["link", "file"]).optional().default("link"),
});

const activitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assignment"),
    prompt: z.string().min(1),
    sampleAnswer: z.string().optional(),
    rubric: z.string().optional(),
    language: languageSchema.optional(),
  }),
  z.object({
    type: z.literal("exercise"),
    language: languageSchema.optional(),
    definition: exerciseDefinitionSchema,
  }),
  z.object({
    type: z.literal("text"),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal("video"),
    muxPlaybackId: z.string().min(1),
    durationSeconds: z.number().int().min(0).optional(),
  }),
]);

const lessonSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  video: z
    .object({
      muxPlaybackId: z.string().min(1),
      durationSeconds: z.number().int().min(0).optional(),
    })
    .optional(),
  attachments: z.array(attachmentSchema).optional().default([]),
  activities: z.array(activitySchema).optional().default([]),
  exercises: z.array(exerciseImportSchema).optional().default([]),
  assessments: z.array(assessmentSchema).optional().default([]),
});

const moduleSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  lessons: z.array(lessonSchema).default([]),
});

const payloadSchema = z.object({
  modules: z.array(moduleSchema).min(1),
});

const requestSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  payload: payloadSchema,
});

type ExerciseEntry = z.infer<typeof exerciseImportSchema>;
type ActivityEntry = z.infer<typeof activitySchema>;
type LessonEntry = z.infer<typeof lessonSchema>;

function buildExerciseEntries(lesson: LessonEntry): ExerciseEntry[] {
  const fromActivities: ExerciseEntry[] = lesson.activities.flatMap((activity: ActivityEntry) => {
    if (activity.type === "exercise") {
      return [
        {
          language: activity.language ?? "both",
          definition: activity.definition,
        },
      ];
    }

    if (activity.type === "assignment") {
      return [
        {
          language: activity.language ?? "both",
          definition: {
            type: "free_text",
            prompt: activity.prompt,
            sampleAnswer: activity.sampleAnswer,
            rubric: activity.rubric,
          },
        },
      ];
    }

    return [];
  });

  const fromExercises = lesson.exercises.map((exercise) => ({
    language: exercise.language ?? "both",
    definition: exercise.definition,
  }));

  const fromAssessments = lesson.assessments.flatMap((assessment) =>
    assessment.exercises.map((exercise) => ({
      language: exercise.language ?? "both",
      definition: exercise.definition,
    })),
  );

  return [...fromActivities, ...fromExercises, ...fromAssessments];
}

/**
 * POST /api/admin/courses/[courseId]/import
 * Bulk import modules/lessons/content for a course from JSON payload.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  try {
    const { courseId } = await params;
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid import payload" },
        { status: 400 },
      );
    }

    const { payload, dryRun } = parsed.data;

    const [existingCourse] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));

    if (!existingCourse) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const summary = payload.modules.reduce(
      (acc, module) => {
        acc.modules += 1;
        acc.lessons += module.lessons.length;

        for (const lesson of module.lessons) {
          acc.attachments += lesson.attachments.length;
          const exerciseEntries = buildExerciseEntries(lesson);
          if (exerciseEntries.length > 0) {
            acc.practiceSets += 1;
            acc.exercises += exerciseEntries.length;
          }
        }

        return acc;
      },
      { modules: 0, lessons: 0, attachments: 0, practiceSets: 0, exercises: 0 },
    );

    if (dryRun) {
      return NextResponse.json({ ok: true, summary });
    }

    const created = await db.transaction(async (tx) => {
      const currentModuleOrderRes = await tx
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${modules.sortOrder}), -1)`,
        })
        .from(modules)
        .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)));

      let nextModuleSortOrder = Number(currentModuleOrderRes[0]?.maxOrder ?? -1) + 1;

      const counters = { ...summary, modules: 0, lessons: 0, attachments: 0, practiceSets: 0, exercises: 0 };

      for (const moduleInput of payload.modules) {
        const [newModule] = await tx
          .insert(modules)
          .values({
            courseId,
            title: moduleInput.title.trim(),
            description: moduleInput.description?.trim() || null,
            sortOrder: nextModuleSortOrder,
          })
          .returning({ id: modules.id });

        counters.modules += 1;
        nextModuleSortOrder += 1;

        let nextLessonSortOrder = 0;
        for (const lessonInput of moduleInput.lessons) {
          const videoActivity = lessonInput.activities.find((a) => a.type === "video");
          const textActivity = lessonInput.activities.find((a) => a.type === "text");
          const mergedContent = [lessonInput.content, textActivity?.type === "text" ? textActivity.content : undefined]
            .filter((v): v is string => Boolean(v && v.trim().length > 0))
            .join("\n\n");

          const [newLesson] = await tx
            .insert(lessons)
            .values({
              moduleId: newModule.id,
              title: lessonInput.title.trim(),
              description: lessonInput.description?.trim() || null,
              content: mergedContent || null,
              muxPlaybackId: lessonInput.video?.muxPlaybackId || (videoActivity?.type === "video" ? videoActivity.muxPlaybackId : null),
              durationSeconds:
                lessonInput.video?.durationSeconds ??
                (videoActivity?.type === "video" ? videoActivity.durationSeconds ?? null : null),
              sortOrder: nextLessonSortOrder,
            })
            .returning({ id: lessons.id });

          counters.lessons += 1;
          nextLessonSortOrder += 1;

          for (let attachmentIndex = 0; attachmentIndex < lessonInput.attachments.length; attachmentIndex++) {
            const attachment = lessonInput.attachments[attachmentIndex];
            await tx.insert(lessonAttachments).values({
              lessonId: newLesson.id,
              title: attachment.title.trim(),
              url: attachment.url,
              type: attachment.type ?? "link",
              sortOrder: attachmentIndex,
            });
            counters.attachments += 1;
          }

          const exerciseEntries = buildExerciseEntries(lessonInput);
          if (exerciseEntries.length > 0) {
            const [newSet] = await tx
              .insert(practiceSets)
              .values({
                title: `Imported: ${lessonInput.title}`,
                description: `Imported practice items for lesson "${lessonInput.title}"`,
                status: "draft",
                createdBy: user.id,
              })
              .returning({ id: practiceSets.id });

            counters.practiceSets += 1;

            await tx.insert(practiceSetAssignments).values({
              practiceSetId: newSet.id,
              targetType: "lesson",
              targetId: newLesson.id,
              assignedBy: user.id,
            });

            for (let exerciseIndex = 0; exerciseIndex < exerciseEntries.length; exerciseIndex++) {
              const exercise = exerciseEntries[exerciseIndex];
              await tx.insert(practiceExercises).values({
                practiceSetId: newSet.id,
                type: exercise.definition.type,
                language: exercise.language ?? "both",
                definition: exercise.definition,
                sortOrder: exerciseIndex,
              });
              counters.exercises += 1;
            }
          }
        }
      }

      return counters;
    });

    return NextResponse.json({ ok: true, created });
  } catch (error) {
    console.error("Error importing course content:", error);
    return NextResponse.json(
      { error: "Failed to import course content" },
      { status: 500 },
    );
  }
}
