import { redirect } from "next/navigation";
import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { getAnyAssignmentReviewer } from "@/lib/assignment-review";
import { AssignmentSubmissionsClient } from "./AssignmentSubmissionsClient";
import {
  parseAssignmentSubmissionListState,
  type AssignmentSubmissionSearchParams,
} from "@/lib/assignment-review-navigation";

interface PageProps {
  searchParams: Promise<AssignmentSubmissionSearchParams>;
}

export default async function AssignmentSubmissionsPage({
  searchParams,
}: PageProps) {
  const [reviewer, rawSearchParams] = await Promise.all([
    getAnyAssignmentReviewer(),
    searchParams,
  ]);
  if (!reviewer) {
    redirect("/home");
  }
  const initialFilters = parseAssignmentSubmissionListState(rawSearchParams);

  const courses = await db
    .select({
      id: courseLibraryCourses.id,
      title: courseLibraryCourses.title,
    })
    .from(courseLibraryCourses)
    .where(isNull(courseLibraryCourses.deletedAt))
    .orderBy(asc(courseLibraryCourses.sortOrder));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Assignment Submissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and grade student assignment submissions
          </p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <a href="/admin/manage" className="text-muted-foreground hover:text-foreground">
            Admin
          </a>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-muted-foreground">Content</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground">Assignment Submissions</span>
        </nav>
      </div>

      <AssignmentSubmissionsClient
        currentUserId={reviewer.id}
        courses={courses}
        initialFilters={initialFilters}
      />
    </div>
  );
}
