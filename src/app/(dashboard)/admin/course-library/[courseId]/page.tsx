import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronLeft, MapPinned } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  tagContentGrants,
  tags,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { COURSE_LIBRARY_COURSE_CONTENT_TYPE } from "@/lib/tag-feature-access";
import {
  isVideoAskVocalHackDestination,
  videoAskMigrationHref,
} from "@/lib/videoask/vocal-hack-routing";
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
  const vocalHackLessonCount = lessons.filter(
    isVideoAskVocalHackDestination,
  ).length;

  const [allTags, grantRows] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .orderBy(asc(tags.name)),
    db
      .select({ tagId: tagContentGrants.tagId })
      .from(tagContentGrants)
      .where(
        and(
          eq(tagContentGrants.contentType, COURSE_LIBRARY_COURSE_CONTENT_TYPE),
          eq(tagContentGrants.contentId, courseId),
        ),
      ),
  ]);

  const hydrated = {
    id: course.id,
    title: course.title,
    summary: course.summary,
    coverImageUrl: course.coverImageUrl,
    isPublished: course.isPublished,
    status: course.status,
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      shortTitle: m.shortTitle,
      mapStyle: m.mapStyle,
      weekLabel: m.weekLabel,
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

      {vocalHackLessonCount > 0 ? (
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <p className="font-semibold text-foreground">
                VideoAsk Vocal Hack migration
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Match this course&apos;s {vocalHackLessonCount} existing Vocal
                Hack lesson{vocalHackLessonCount === 1 ? "" : "s"} with their
                VideoAsk coach videos.
              </p>
            </div>
          </div>
          <Link
            href={videoAskMigrationHref({ courseId })}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            Match this course
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Course editor
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {course.title}
        </h1>
      </header>

      <CourseLibraryEditorClient
        initialCourse={hydrated}
        allTags={allTags}
        initialAllowedTagIds={grantRows.map((g) => g.tagId)}
        initialAllowedUserIds={
          Array.isArray(course.allowedUserIds) ? course.allowedUserIds : []
        }
      />
    </div>
  );
}
