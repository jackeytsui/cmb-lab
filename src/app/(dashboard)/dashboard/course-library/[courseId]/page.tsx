import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Video,
  FileText,
  HelpCircle,
  Download,
} from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

const TYPE_ICON = {
  video: Video,
  text: FileText,
  quiz: HelpCircle,
  download: Download,
};
const TYPE_COLOR = {
  video: "text-red-500",
  text: "text-blue-500",
  quiz: "text-amber-500",
  download: "text-emerald-500",
};

export default async function CourseLibraryCourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;

  const [course] = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .limit(1);

  if (!course) notFound();

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

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href="/dashboard/course-library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to courses
        </Link>

        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">{course.title}</h1>
          {course.summary && (
            <p className="mt-2 text-sm text-muted-foreground">{course.summary}</p>
          )}
        </header>

        {modules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This course has no lessons yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((mod) => {
              const modLessons = lessonsByModule.get(mod.id) ?? [];
              return (
                <div
                  key={mod.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border bg-muted/20">
                    <h2 className="text-sm font-semibold text-foreground">
                      {mod.title}
                    </h2>
                  </div>
                  <div className="divide-y divide-border">
                    {modLessons.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground italic">
                        No lessons in this module yet.
                      </p>
                    ) : (
                      modLessons.map((lesson) => {
                        const Icon = TYPE_ICON[lesson.lessonType];
                        const color = TYPE_COLOR[lesson.lessonType];
                        return (
                          <Link
                            key={lesson.id}
                            href={`/dashboard/course-library/${courseId}/lessons/${lesson.id}`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <Icon className={cn("w-4 h-4 shrink-0", color)} />
                            <span className="text-xs text-muted-foreground uppercase font-medium w-16">
                              {lesson.lessonType}
                            </span>
                            <span className="flex-1 text-sm text-foreground">
                              {lesson.title}
                            </span>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
