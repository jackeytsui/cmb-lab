import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentSubmissions,
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssignmentFeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const rows = await db
    .select({
      id: assignmentSubmissions.id,
      finalScore: assignmentSubmissions.finalScore,
      reviewedAt: assignmentSubmissions.reviewedAt,
      studentViewedAt: assignmentSubmissions.studentViewedAt,
      lessonTitle: courseLibraryLessons.title,
      moduleTitle: courseLibraryModules.title,
      courseTitle: courseLibraryCourses.title,
    })
    .from(assignmentSubmissions)
    .innerJoin(
      courseLibraryLessons,
      eq(assignmentSubmissions.lessonId, courseLibraryLessons.id),
    )
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
        eq(assignmentSubmissions.studentId, user.id),
        eq(assignmentSubmissions.status, "reviewed"),
      ),
    )
    .orderBy(desc(assignmentSubmissions.reviewedAt));

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground">
        Assignment Feedback
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        View feedback from your past assignments.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No reviewed assignments yet. Once a coach reviews one of your
            assignments, the feedback will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const unread = !row.studentViewedAt;
            return (
              <Link
                key={row.id}
                href={`/dashboard/assignment-feedback/${row.id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">
                        {row.lessonTitle}
                      </span>
                      {unread && (
                        <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.courseTitle} → {row.moduleTitle}
                      {row.reviewedAt && (
                        <>
                          {" · Reviewed on "}
                          {new Date(row.reviewedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      Reviewed
                    </span>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Score
                      </div>
                      <div className="text-lg font-bold text-foreground">
                        {typeof row.finalScore === "number"
                          ? `${row.finalScore}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
