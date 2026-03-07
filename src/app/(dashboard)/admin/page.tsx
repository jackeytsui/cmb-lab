import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, lessons, users, aiPrompts, kbEntries, practiceSets } from "@/db/schema";
import { isNull, count, eq } from "drizzle-orm";
import Link from "next/link";
import { Sparkles, BookOpen, BarChart3, Link2, ClipboardList } from "lucide-react";


/**
 * Admin Dashboard page - displays admin navigation and stats.
 *
 * Access Control:
 * - Requires admin role
 * - Non-admins are redirected to /dashboard
 */
export default async function AdminDashboardPage() {
  // Verify user has admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get current user for personalized greeting
  const user = await currentUser();
  const displayName = user?.firstName || "Admin";

  // Fetch stats used in select management cards
  let stats: {
    courses: number;
    lessons: number;
    students: number;
    prompts: number;
    kbEntries: number;
    practiceSets: number;
  } | null = null;

  try {
    const [courseCount, lessonCount, studentCount, promptCount, kbEntryCount, practiceSetCount] = await Promise.all([
      db
        .select({ count: count() })
        .from(courses)
        .where(isNull(courses.deletedAt)),
      db
        .select({ count: count() })
        .from(lessons)
        .where(isNull(lessons.deletedAt)),
      db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "student")),
      db
        .select({ count: count() })
        .from(aiPrompts),
      db
        .select({ count: count() })
        .from(kbEntries),
      db
        .select({ count: count() })
        .from(practiceSets)
        .where(isNull(practiceSets.deletedAt)),
    ]);

    stats = {
      courses: Number(courseCount[0]?.count || 0),
      lessons: Number(lessonCount[0]?.count || 0),
      students: Number(studentCount[0]?.count || 0),
      prompts: Number(promptCount[0]?.count || 0),
      kbEntries: Number(kbEntryCount[0]?.count || 0),
      practiceSets: Number(practiceSetCount[0]?.count || 0),
    };
  } catch {}

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <p className="mt-2 text-muted-foreground">
            Welcome back, {displayName}. Manage your LMS content and users.
          </p>
        </div>

        {/* Navigation cards */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground/80">
            Management
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/admin/courses"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-300">
                Courses
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create and manage courses, modules, and lessons
              </p>
            </Link>

            <Link
              href="/admin/analytics"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-300">
                Analytics
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Student engagement, completion rates, and drop-off analysis
              </p>
            </Link>

            <Link
              href="/admin/users"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-300">
                Users
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage users, roles, and access statuses
              </p>
            </Link>

            <Link
              href="/admin/ai-logs"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-green-600 dark:group-hover:text-green-300">
                AI Logs
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                View AI conversation logs and analytics
              </p>
            </Link>

            <Link
              href="/admin/prompts"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-300">
                AI Prompts
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage AI prompts for grading and voice conversation
              </p>
              {stats && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.prompts} {stats.prompts === 1 ? "prompt" : "prompts"}
                </p>
              )}
            </Link>

            <Link
              href="/admin/content"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-300">
                Content Management
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload videos, batch assign, move content
              </p>
            </Link>

            <Link
              href="/admin/exercises"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-300">
                Practice Exercises
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create and manage practice exercises for students
              </p>
              {stats && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.practiceSets}{" "}
                  {stats.practiceSets === 1 ? "practice set" : "practice sets"}
                </p>
              )}
            </Link>

            <Link
              href="/admin/knowledge"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-300">
                Knowledge Base
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage knowledge entries and file uploads for AI chatbot
              </p>
              {stats && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.kbEntries} {stats.kbEntries === 1 ? "entry" : "entries"}
                </p>
              )}
            </Link>
          </div>
        </section>

        {/* Integrations */}
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-foreground/80">
            Integrations
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/admin/ghl"
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <Link2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                GHL Integration
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage GoHighLevel CRM connection, field mappings, and sync events
              </p>
            </Link>
          </div>
        </section>
      </div>
  );
}
