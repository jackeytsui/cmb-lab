import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { asc, desc, isNull } from "drizzle-orm";
import { CourseLibraryListClient } from "./CourseLibraryListClient";

export const metadata = {
  title: "Course Library — Admin",
};

export default async function CourseLibraryAdminPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const courses = await db
    .select()
    .from(courseLibraryCourses)
    .where(isNull(courseLibraryCourses.deletedAt))
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      desc(courseLibraryCourses.createdAt),
    );

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Course Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Host and manage video, text, quiz, and downloadable course content.
          Currently admin-only — enable the <code>course_library</code> feature
          to grant students access.
        </p>
      </header>

      <CourseLibraryListClient
        initialCourses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.summary,
          coverImageUrl: c.coverImageUrl,
          isPublished: c.isPublished,
          sortOrder: c.sortOrder,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
