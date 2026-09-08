import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ArrowLeft, BookOpenCheck, Tags, UserRound } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { StudentCourseLibraryUnlock } from "@/components/admin/StudentCourseLibraryUnlock";
import { getCurrentUser, getRealUser, hasMinimumRole } from "@/lib/auth";
import { canAccessStudentSupportTools } from "@/lib/coach-student-scope";
import { canProvideStudentSupport } from "@/lib/platform-roles";
import { StudentTagsSection } from "@/app/(dashboard)/admin/students/[studentId]/StudentTagsSection";

type Props = {
  params: Promise<{ studentId: string }>;
};

export default async function StudentSupportPage({ params }: Props) {
  if (!(await hasMinimumRole("coach"))) redirect("/home");

  const realActor = await getRealUser();
  if (!realActor) redirect("/home");
  const actor =
    realActor.role === "admin"
      ? ((await getCurrentUser()) ?? realActor)
      : realActor;
  if (!canProvideStudentSupport(actor.role)) redirect("/home");

  const { studentId } = await params;
  const student = await db.query.users.findFirst({
    where: and(
      eq(users.id, studentId),
      eq(users.role, "student"),
      isNull(users.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      assignedCoachId: true,
      additionalCoachIds: true,
    },
  });

  if (
    !student ||
    !canAccessStudentSupportTools({
      actorUserId: actor.id,
      actorRole: actor.role,
      assignedCoachId: student.assignedCoachId,
      additionalCoachIds: student.additionalCoachIds,
    })
  ) {
    notFound();
  }

  const displayName = student.name?.trim() || student.email;

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/coach/students"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to students
      </Link>

      <header className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <UserRound className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{student.email}</p>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Student support view. Manage learning access and tags here;
              coaching notes, ratings, submissions, and conversations are not
              included.
            </p>
          </div>
        </div>
      </header>

      <section className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Tags className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">Access tags</h2>
        </div>
        <StudentTagsSection studentId={student.id} />
      </section>

      <section
        id="course-library-progress"
        className="scroll-mt-6 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2">
          <BookOpenCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">
            Course access &amp; progress
          </h2>
        </div>
        <StudentCourseLibraryUnlock
          studentId={student.id}
          studentName={displayName}
        />
      </section>
    </main>
  );
}
