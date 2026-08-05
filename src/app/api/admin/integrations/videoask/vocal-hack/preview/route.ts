import { NextResponse } from "next/server";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  videoaskFormImports,
  videoaskMediaImports,
  videoaskStepImports,
} from "@/db/schema";
import {
  VIDEOASK_VOCAL_HACK_COURSES,
  VIDEOASK_VOCAL_HACK_GROUP_KEYS,
  VIDEOASK_VOCAL_HACK_GROUPS,
  isTargetVocalHackForm,
  recommendVocalHackPlacement,
  type PlacementCatalog,
} from "@/lib/videoask/vocal-hack-mapping";

export const dynamic = "force-dynamic";

const COMPLETE_IMPORT_STATUSES = [
  "completed",
  "completed_with_warnings",
] as const;

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sourceRows, totalRows, courseRows] = await Promise.all([
    db
      .select({
        formImportId: videoaskFormImports.id,
        sourceFormId: videoaskFormImports.sourceFormId,
        sourceTitle: videoaskFormImports.sourceFormTitle,
        sourceFolderKey: videoaskFormImports.sourceFolderKey,
        importStatus: videoaskFormImports.status,
        stepCount: count(videoaskStepImports.id),
        mediaReady: sql<number>`count(${videoaskStepImports.id}) filter (
          where ${videoaskMediaImports.status} = 'ready'
            and ${videoaskMediaImports.destinationUrl} is not null
        )`,
      })
      .from(videoaskFormImports)
      .leftJoin(
        videoaskStepImports,
        eq(videoaskStepImports.formImportId, videoaskFormImports.id),
      )
      .leftJoin(
        videoaskMediaImports,
        eq(videoaskMediaImports.id, videoaskStepImports.mediaImportId),
      )
      .where(
        and(
          inArray(
            videoaskFormImports.sourceFolderKey,
            VIDEOASK_VOCAL_HACK_GROUP_KEYS,
          ),
          inArray(videoaskFormImports.status, COMPLETE_IMPORT_STATUSES),
        ),
      )
      .groupBy(videoaskFormImports.id),
    db.select({ value: count() }).from(videoaskFormImports),
    db
      .select({
        id: courseLibraryCourses.id,
        title: courseLibraryCourses.title,
      })
      .from(courseLibraryCourses)
      .where(
        and(
          inArray(courseLibraryCourses.title, [
            VIDEOASK_VOCAL_HACK_COURSES.foundations,
            VIDEOASK_VOCAL_HACK_COURSES.intermediate,
            VIDEOASK_VOCAL_HACK_COURSES.advanced,
            VIDEOASK_VOCAL_HACK_COURSES.cantonese,
          ]),
          isNull(courseLibraryCourses.deletedAt),
        ),
      ),
  ]);

  const courseIds = courseRows.map((course) => course.id);
  const moduleRows =
    courseIds.length > 0
      ? await db
          .select({
            id: courseLibraryModules.id,
            courseId: courseLibraryModules.courseId,
            title: courseLibraryModules.title,
            sortOrder: courseLibraryModules.sortOrder,
          })
          .from(courseLibraryModules)
          .where(
            and(
              inArray(courseLibraryModules.courseId, courseIds),
              isNull(courseLibraryModules.deletedAt),
            ),
          )
          .orderBy(asc(courseLibraryModules.sortOrder))
      : [];

  const moduleIds = moduleRows.map((module) => module.id);
  const lessonRows =
    moduleIds.length > 0
      ? await db
          .select({
            id: courseLibraryLessons.id,
            moduleId: courseLibraryLessons.moduleId,
            title: courseLibraryLessons.title,
            lessonType: courseLibraryLessons.lessonType,
            sortOrder: courseLibraryLessons.sortOrder,
          })
          .from(courseLibraryLessons)
          .where(
            and(
              inArray(courseLibraryLessons.moduleId, moduleIds),
              isNull(courseLibraryLessons.deletedAt),
            ),
          )
          .orderBy(asc(courseLibraryLessons.sortOrder))
      : [];

  const catalog: PlacementCatalog = {
    courses: courseRows,
    modules: moduleRows.map((module) => ({
      ...module,
      lessons: lessonRows
        .filter((lesson) => lesson.moduleId === module.id)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          lessonType: lesson.lessonType,
          sortOrder: lesson.sortOrder,
        })),
    })),
  };

  const groupOrder = new Map(
    VIDEOASK_VOCAL_HACK_GROUPS.map((group, index) => [group.key, index]),
  );
  const forms = sourceRows
    .filter((row) =>
      isTargetVocalHackForm(row.sourceFolderKey, row.sourceTitle),
    )
    .map((row) => {
      const placement = recommendVocalHackPlacement(
        row.sourceFolderKey,
        row.sourceTitle,
        catalog,
      );
      if (!placement) return null;
      const stepCount = Number(row.stepCount);
      const mediaReady = Number(row.mediaReady);
      return {
        formImportId: row.formImportId,
        sourceFormId: row.sourceFormId,
        sourceTitle: row.sourceTitle,
        sourceFolderKey: row.sourceFolderKey,
        sourceGroup: placement.sourceGroup.label,
        language: placement.language,
        stepCount,
        mediaReady,
        mediaComplete: stepCount > 0 && mediaReady === stepCount,
        targetCourse: placement.targetCourse,
        targetModule: placement.targetModule
          ? {
              id: placement.targetModule.id,
              title: placement.targetModule.title,
            }
          : null,
        targetLesson: placement.targetLesson,
        targetLessonTitle: placement.targetLessonTitle,
        action: placement.action,
        confidence: placement.confidence,
        score: placement.score,
        reason: placement.reason,
      };
    })
    .filter((form): form is NonNullable<typeof form> => Boolean(form))
    .sort((a, b) => {
      const groupDelta =
        (groupOrder.get(a.sourceFolderKey) ?? 99) -
        (groupOrder.get(b.sourceFolderKey) ?? 99);
      return (
        groupDelta ||
        a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    });

  const mapped = forms.filter((form) => form.action !== "manual");
  const exact = forms.filter((form) => form.confidence === "exact").length;
  const high = forms.filter((form) => form.confidence === "high").length;
  const review = forms.filter((form) => form.confidence === "review").length;
  const manual = forms.filter((form) => form.confidence === "manual").length;
  const mediaReady = forms.filter((form) => form.mediaComplete).length;
  const targetSentenceVideos = forms.reduce(
    (total, form) => total + form.stepCount,
    0,
  );
  const targetTotal = forms.length;
  const importedTotal = Number(totalRows[0]?.value ?? 0);

  return NextResponse.json({
    summary: {
      importedTotal,
      targetTotal,
      ignoredTotal: Math.max(0, importedTotal - targetTotal),
      mapped: mapped.length,
      exact,
      high,
      review,
      manual,
      mediaReady,
      targetSentenceVideos,
      aiTranscriptionRequired: targetSentenceVideos,
    },
    forms,
  });
}
