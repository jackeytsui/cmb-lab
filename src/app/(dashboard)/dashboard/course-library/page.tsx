import Link from "next/link";
import { BookOpen } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export const metadata = {
  title: "Course Library",
};

export default async function CourseLibraryStudentPage() {
  const courses = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        isNull(courseLibraryCourses.deletedAt),
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .orderBy(asc(courseLibraryCourses.sortOrder));

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Course Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse available courses and track your progress.
          </p>
        </header>

        {courses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No courses available yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/course-library/${course.id}`}
                className="group rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
              >
                <div className="aspect-video bg-muted relative">
                  {course.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.coverImageUrl}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <BookOpen className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                    {course.title}
                  </h3>
                  {course.summary && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {course.summary}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
