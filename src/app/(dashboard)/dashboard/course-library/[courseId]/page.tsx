import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CourseLibraryGate } from "@/components/course-library/CourseLibraryGate";
import { CourseMap, type CourseMapStop } from "@/components/course-library/CourseMap";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseLibraryCourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const currentUser = await getCurrentUser();

  const [course] = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(currentUser?.role),
        ),
      ),
    )
    .limit(1);

  if (!course) notFound();

  const canSeeCourse = await getCourseLibraryCourseAccess(currentUser);
  if (!canSeeCourse(course.id)) notFound();

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
          .select({
            id: courseLibraryLessons.id,
            moduleId: courseLibraryLessons.moduleId,
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

  const progressRows =
    currentUser && lessons.length > 0
      ? await db
          .select({
            lessonId: courseLibraryLessonProgress.lessonId,
            completedAt: courseLibraryLessonProgress.completedAt,
          })
          .from(courseLibraryLessonProgress)
          .where(
            and(
              eq(courseLibraryLessonProgress.userId, currentUser.id),
              inArray(
                courseLibraryLessonProgress.lessonId,
                lessons.map((lesson) => lesson.id),
              ),
            ),
          )
      : [];

  const completedLessonIds = new Set(
    progressRows.filter((row) => row.completedAt).map((row) => row.lessonId),
  );

  const lessonsByModule = new Map<string, string[]>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.moduleId, list);
  }

  const stops: CourseMapStop[] = modules.map((mod) => {
    const modLessonIds = lessonsByModule.get(mod.id) ?? [];
    const completedCount = modLessonIds.filter((id) =>
      completedLessonIds.has(id),
    ).length;
    return {
      id: mod.id,
      title: mod.title,
      shortTitle: mod.shortTitle,
      mapStyle: mod.mapStyle,
      weekLabel: mod.weekLabel,
      lessonCount: modLessonIds.length,
      completedCount,
      isComplete: modLessonIds.length > 0 && completedCount === modLessonIds.length,
    };
  });

  // The stop the student should do next: first stop with unfinished subpages.
  const currentIndex = stops.findIndex(
    (stop) => stop.lessonCount > 0 && !stop.isComplete,
  );
  const completedStops = stops.filter((stop) => stop.isComplete).length;
  const totalTrackedStops = stops.filter((stop) => stop.lessonCount > 0).length;
  const percentComplete =
    totalTrackedStops > 0
      ? Math.round((completedStops / totalTrackedStops) * 100)
      : 0;
  // Progress-ring geometry (r = 34, stroke = 8 inside a 76×76 viewBox).
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;
  const MARK_MASK = {
    WebkitMaskImage: "url(/cmb-mark-white-v2.png)",
    maskImage: "url(/cmb-mark-white-v2.png)",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  } as const;

  return (
    <CourseLibraryGate>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href="/dashboard/course-library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to courses
        </Link>

        <header className="mb-5">
          <div
            className="relative overflow-hidden rounded-2xl px-6 py-6 sm:px-8"
            style={{
              background: "linear-gradient(120deg, #26307f 0%, #3a49b8 100%)",
            }}
          >
            {/* Faint brand watermark */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 right-28 hidden h-64 w-64 sm:block"
              style={{ ...MARK_MASK, backgroundColor: "rgba(255,255,255,0.06)" }}
            />
            <div className="relative flex items-center justify-between gap-6">
              <div className="min-w-0">
                <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5"
                    style={{ ...MARK_MASK, backgroundColor: "#ffffff" }}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                    Course Roadmap
                  </span>
                </div>
                <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-[28px]">
                  {course.title}
                </h1>
                {course.summary && (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">
                    {course.summary}
                  </p>
                )}
              </div>
              {totalTrackedStops > 0 && (
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <svg width="76" height="76" viewBox="0 0 76 76">
                    <circle
                      cx="38"
                      cy="38"
                      r="34"
                      fill="none"
                      stroke="rgba(255,255,255,0.28)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="38"
                      cy="38"
                      r="34"
                      fill="none"
                      stroke="#f2b705"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={
                        RING_CIRCUMFERENCE * (1 - percentComplete / 100)
                      }
                      transform="rotate(-90 38 38)"
                    />
                    <text
                      x="50%"
                      y="50%"
                      dominantBaseline="central"
                      textAnchor="middle"
                      fontSize="17"
                      fontWeight="800"
                      fill="#ffffff"
                    >
                      {percentComplete}%
                    </text>
                  </svg>
                  <span className="whitespace-nowrap text-xs font-semibold text-white/85">
                    {completedStops} / {totalTrackedStops} stops
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {stops.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This course has no lessons yet.
            </p>
          </div>
        ) : (
          <CourseMap
            courseId={courseId}
            stops={stops}
            currentIndex={currentIndex}
          />
        )}
      </div>
    </CourseLibraryGate>
  );
}
