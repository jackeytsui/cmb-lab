import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronLeft, MapPinned } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { LessonEditorClient } from "./LessonEditorClient";
import type { CourseLibraryLesson } from "@/db/schema/course-library";
import {
  isVideoAskVocalHackDestination,
  videoAskMigrationHref,
} from "@/lib/videoask/vocal-hack-routing";

type LessonEditorLessonType = NonNullable<CourseLibraryLesson["lessonType"]>;

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonEditorPage({ params }: PageProps) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) redirect("/dashboard");

  const { courseId, lessonId } = await params;

  const [row] = await db
    .select({
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      lessonType: courseLibraryLessons.lessonType,
      content: courseLibraryLessons.content,
      moduleId: courseLibraryLessons.moduleId,
      moduleTitle: courseLibraryModules.title,
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);

  if (!row) notFound();
  const isVocalHack = isVideoAskVocalHackDestination({
    title: row.lessonTitle,
    lessonType: row.lessonType,
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href={`/admin/course-library/${courseId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to {row.courseTitle}
      </Link>

      <div className="mb-4 text-xs text-muted-foreground">
        {row.courseTitle} → {row.moduleTitle}
      </div>

      {isVocalHack ? (
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <p className="font-semibold text-foreground">
                Fill this Vocal Hack from VideoAsk
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Find the matching source form, review its coach videos, and
                publish them into this existing lesson.
              </p>
            </div>
          </div>
          <Link
            href={videoAskMigrationHref({
              courseId: row.courseId,
              moduleId: row.moduleId,
              lessonId: row.lessonId,
            })}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Match VideoAsk source
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      <LessonEditorClient
        initialLesson={{
          id: row.lessonId,
          title: row.lessonTitle,
          lessonType: row.lessonType as LessonEditorLessonType,
          content: (row.content ?? {}) as Record<string, unknown>,
        }}
      />
    </div>
  );
}
