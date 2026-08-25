import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPinned } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { asc, desc, isNull } from "drizzle-orm";
import { CourseLibraryListClient } from "./CourseLibraryListClient";
import { videoAskMigrationHref } from "@/lib/videoask/vocal-hack-routing";

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
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        href="/admin/manage"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Admin workspace
      </Link>
      <header className="mb-8 border-b border-border/70 pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Content
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Course Library
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Host and manage video, text, quiz, and downloadable course content.
          Students see the Course Library only when one of their tags grants a
          course (Tag Management) or they&apos;re added to a course&apos;s
          student list — staff always have access.
        </p>
      </header>

      <div className="mb-7 flex flex-col gap-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex gap-3">
          <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <h2 className="font-semibold text-foreground">
              Migrate VideoAsk Vocal Hacks
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Match the existing VideoAsk coach videos to the native Vocal Hack
              lessons already inside Foundations, Intermediate, and Advanced.
              Nothing is published until each destination is reviewed.
            </p>
          </div>
        </div>
        <Link
          href={videoAskMigrationHref()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Open migration workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <CourseLibraryListClient
        initialCourses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.summary,
          coverImageUrl: c.coverImageUrl,
          isPublished: c.isPublished,
          status: c.status,
          sortOrder: c.sortOrder,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
