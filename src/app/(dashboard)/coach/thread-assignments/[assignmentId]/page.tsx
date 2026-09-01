import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Calendar, GitBranch } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { getThreadAssignmentProgress } from "@/lib/thread-assignments";
import { ThreadAssignmentProgress } from "@/components/coach/ThreadAssignmentProgress";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { z } from "zod";

/**
 * Coach progress detail page for a single thread assignment.
 * Server component -- direct DB query (v7-14 pattern).
 */
export default async function CoachThreadAssignmentProgressPage(props: {
  params: Promise<{ assignmentId: string }>;
}) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/home");
  }

  const { assignmentId } = await props.params;
  if (!z.string().uuid().safeParse(assignmentId).success) {
    notFound();
  }

  const access = await getStaffStudentAccessContext();
  if (access.status !== "authorized") {
    redirect("/home");
  }

  const data = await getThreadAssignmentProgress(
    assignmentId,
    access.actor.role === "admin" ? null : access.actor.id,
  );

  if (!data) {
    notFound();
  }

  const displayTitle = data.assignment.threadTitle || "Untitled Thread";

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/coach/thread-assignments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Thread Assignments
      </Link>

      {/* Header */}
      <div className="flex gap-6 mb-8">
        {/* Thread icon */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
          <GitBranch className="h-10 w-10 text-indigo-400" />
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{displayTitle}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            {data.assignment.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due: {format(new Date(data.assignment.dueDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress table */}
      <ThreadAssignmentProgress data={data} />
    </div>
  );
}
