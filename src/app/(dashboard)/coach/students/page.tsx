import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, courseAccess, studentTags, tags } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { StudentListWithTags } from "./StudentListWithTags";

import { ErrorAlert } from "@/components/ui/error-alert";

/**
 * Student data with access count and tags for display
 */
interface StudentWithAccessAndTags {
  id: string;
  name: string | null;
  email: string;
  accessCount: number;
  tags: { id: string; name: string; color: string; type: "coach" | "system" }[];
}

/**
 * Coach Students page - displays list of students for access management.
 *
 * This is the interface for coaches to:
 * - View all registered students
 * - See how many courses each student has access to
 * - Manage student tags (assign, remove, filter)
 * - Expand to manage individual student's course access
 *
 * Access Control:
 * - Requires minimum coach role (coach or admin)
 * - Students are redirected to their dashboard
 *
 * Server component that queries database directly.
 */
export default async function CoachStudentsPage() {
  // Verify user has coach role or higher
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get current user for personalized greeting
  const user = await currentUser();
  const displayName = user?.firstName || "Coach";

  try {
    // Query all students with their course access count
    const studentsWithCount = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        accessCount: sql<number>`COUNT(${courseAccess.id})`.as("access_count"),
      })
      .from(users)
      .leftJoin(courseAccess, eq(courseAccess.userId, users.id))
      .where(eq(users.role, "student"))
      .groupBy(users.id, users.name, users.email)
      .orderBy(users.email);

    // Fetch tags for all students in a single query
    const studentIds = studentsWithCount.map((s) => s.id);
    const studentTagsMap: Record<
      string,
      { id: string; name: string; color: string; type: "coach" | "system" }[]
    > = {};

    if (studentIds.length > 0) {
      const tagRows = await db
        .select({
          userId: studentTags.userId,
          tagId: tags.id,
          tagName: tags.name,
          tagColor: tags.color,
          tagType: tags.type,
        })
        .from(studentTags)
        .innerJoin(tags, eq(studentTags.tagId, tags.id))
        .where(inArray(studentTags.userId, studentIds));

      for (const row of tagRows) {
        if (!studentTagsMap[row.userId]) {
          studentTagsMap[row.userId] = [];
        }
        studentTagsMap[row.userId].push({
          id: row.tagId,
          name: row.tagName,
          color: row.tagColor,
          type: row.tagType,
        });
      }
    }

    // Format for client component
    const students: StudentWithAccessAndTags[] = studentsWithCount.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      accessCount: Number(s.accessCount) || 0,
      tags: studentTagsMap[s.id] || [],
    }));

    return (
      <div className="container mx-auto px-4 py-8">
        {/* Page subtitle */}
        <div className="mb-8">
          <p className="text-zinc-400">
            Welcome back, {displayName}. Manage student course access and permissions.
          </p>
        </div>

        {/* Student list with tags and filtering */}
        <section aria-label="Student List">
          {students.length === 0 ? (
            <EmptyState />
          ) : (
            <StudentListWithTags students={students} />
          )}
        </section>
      </div>
    );
  } catch (error) {
    console.error("Failed to load student data:", error);
    return (
      <div className="container mx-auto px-4 py-8">
        {/* Greeting still renders (from Clerk, not DB) */}
        <div className="mb-8">
          <p className="text-zinc-400">
            Welcome back, {displayName}. Manage student course access and permissions.
          </p>
        </div>

        <ErrorAlert
          variant="block"
          message="Unable to load student data. Please try refreshing the page."
        />
      </div>
    );
  }
}

/**
 * Empty state when no students are registered
 */
function EmptyState() {
  return (
    <div className="text-center py-16">
      <svg
        className="w-16 h-16 text-zinc-600 mx-auto mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <h2 className="text-xl font-semibold text-zinc-300">
        No students registered yet
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        Students will appear here once they sign up and are assigned the student role.
      </p>
    </div>
  );
}
