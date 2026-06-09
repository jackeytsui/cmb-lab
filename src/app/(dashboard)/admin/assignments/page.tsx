import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { lessonSubmissions, lessons, users } from "@/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { isAssignmentType, ASSIGNMENT_TYPE_LABELS } from "@/lib/assignment-types";
import type { AssignmentLessonType } from "@/lib/assignment-types";

export const dynamic = "force-dynamic";

export default async function AssignmentSubmissionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const rows = await db
    .select({
      submission: lessonSubmissions,
      lesson: {
        id: lessons.id,
        title: lessons.title,
        lessonType: lessons.lessonType,
      },
      student: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
    })
    .from(lessonSubmissions)
    .innerJoin(lessons, eq(lessonSubmissions.lessonId, lessons.id))
    .innerJoin(users, eq(lessonSubmissions.userId, users.id))
    .where(isNull(lessons.deletedAt))
    .orderBy(desc(lessonSubmissions.createdAt));

  const filtered = rows.filter((r) => isAssignmentType(r.lesson.lessonType));
  const pending = filtered.filter((r) => r.submission.status === "pending");
  const reviewed = filtered.filter((r) => r.submission.status === "reviewed");

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Assignment Submissions</h1>
        <p className="text-zinc-400 text-sm mb-8">Review student submissions across all assignment types.</p>

        {/* Pending */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Pending Review
            <span className="rounded-full bg-amber-600/30 text-amber-400 text-xs px-2 py-0.5">{pending.length}</span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-zinc-500 text-sm">No pending submissions.</p>
          ) : (
            <div className="space-y-3">
              {pending.map(({ submission, lesson, student }) => (
                <Link
                  key={submission.id}
                  href={`/admin/assignments/${submission.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 hover:bg-zinc-800 transition-colors"
                >
                  <div>
                    <p className="font-medium text-white">{lesson.title}</p>
                    <p className="text-sm text-zinc-400">
                      {student.name || student.email}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {ASSIGNMENT_TYPE_LABELS[lesson.lessonType as AssignmentLessonType]} ·{" "}
                      {new Date(submission.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-600/40 bg-amber-950/30 px-3 py-1 text-xs text-amber-400">
                    Pending
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Reviewed */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Reviewed
            <span className="rounded-full bg-green-600/20 text-green-400 text-xs px-2 py-0.5">{reviewed.length}</span>
          </h2>
          {reviewed.length === 0 ? (
            <p className="text-zinc-500 text-sm">No reviewed submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {reviewed.map(({ submission, lesson, student }) => (
                <Link
                  key={submission.id}
                  href={`/admin/assignments/${submission.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 hover:bg-zinc-800 transition-colors opacity-80"
                >
                  <div>
                    <p className="font-medium text-white">{lesson.title}</p>
                    <p className="text-sm text-zinc-400">
                      {student.name || student.email}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {ASSIGNMENT_TYPE_LABELS[lesson.lessonType as AssignmentLessonType]} ·{" "}
                      {new Date(submission.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="rounded-full border border-green-700/40 bg-green-950/20 px-3 py-1 text-xs text-green-400">
                    Reviewed
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
