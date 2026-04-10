import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { LessonEditorClient } from "./LessonEditorClient";

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

      <LessonEditorClient
        initialLesson={{
          id: row.lessonId,
          title: row.lessonTitle,
          lessonType: row.lessonType,
          content: (row.content ?? {}) as Record<string, unknown>,
        }}
      />
    </div>
  );
}
