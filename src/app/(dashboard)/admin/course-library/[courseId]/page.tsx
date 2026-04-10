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
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { CourseLibraryEditorClient } from "./CourseLibraryEditorClient";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseLibraryEditorPage({ params }: PageProps) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { courseId } = await params;

  const [course] = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);

  if (!course) {
    notFound();
  }

  const modules = await db
    .select()
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .orderBy(asc(courseLibraryModules.sortOrder));

  const moduleIds = modules.map((m) => m.id);
  const lessons =
    moduleIds.length > 0
      ? await db
          .select()
          .from(courseLibraryLessons)
          .where(
            and(
              inArray(courseLibraryLessons.moduleId, moduleIds),
              isNull(courseLibraryLessons.deletedAt),
            ),
          )
          .orderBy(asc(courseLibraryLessons.sortOrder))
      : [];

  const lessonsByModule = new Map<string, typeof lessons>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l);
    lessonsByModule.set(l.moduleId, list);
  }

  const hydrated = {
    id: course.id,
    title: course.title,
    summary: course.summary,
    coverImageUrl: course.coverImageUrl,
    isPublished: course.isPublished,
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      lessons: (lessonsByModule.get(m.id) ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        lessonType: l.lessonType,
        sortOrder: l.sortOrder,
      })),
    })),
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/admin/course-library"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to courses
      </Link>

      <CourseLibraryEditorClient initialCourse={hydrated} />
    </div>
  );
}
