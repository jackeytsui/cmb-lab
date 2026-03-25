import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, lessons, users, aiPrompts, kbEntries, practiceSets } from "@/db/schema";
import { isNull, count, eq } from "drizzle-orm";
import { Sparkles, BookOpen, BarChart3, Link2, ClipboardList, Zap } from "lucide-react";
import { AdminDashboardGrid, type AdminTile } from "@/components/admin/AdminDashboardGrid";

export default async function AdminDashboardPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const user = await currentUser();
  const displayName = user?.firstName || "Admin";

  let stats: {
    prompts: number;
    kbEntries: number;
    practiceSets: number;
  } | null = null;

  try {
    const [promptCount, kbEntryCount, practiceSetCount] = await Promise.all([
      db.select({ count: count() }).from(aiPrompts),
      db.select({ count: count() }).from(kbEntries),
      db
        .select({ count: count() })
        .from(practiceSets)
        .where(isNull(practiceSets.deletedAt)),
    ]);

    stats = {
      prompts: Number(promptCount[0]?.count || 0),
      kbEntries: Number(kbEntryCount[0]?.count || 0),
      practiceSets: Number(practiceSetCount[0]?.count || 0),
    };
  } catch {}

  const tiles: AdminTile[] = [
    {
      id: "courses",
      href: "/admin/courses",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
          </svg>
        </div>
      ),
      title: "Courses",
      description: "Create and manage courses, modules, and lessons",
      hoverColor: "group-hover:text-blue-600 dark:group-hover:text-blue-300",
      section: "management",
    },
    {
      id: "analytics",
      href: "/admin/analytics",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
          <BarChart3 className="h-6 w-6" />
        </div>
      ),
      title: "Analytics",
      description: "Student engagement, completion rates, and drop-off analysis",
      hoverColor: "group-hover:text-amber-600 dark:group-hover:text-amber-300",
      section: "management",
    },
    {
      id: "users",
      href: "/admin/users",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      ),
      title: "Users",
      description: "Manage users, roles, and access statuses",
      hoverColor: "group-hover:text-purple-600 dark:group-hover:text-purple-300",
      section: "management",
    },
    {
      id: "ai-logs",
      href: "/admin/ai-logs",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </div>
      ),
      title: "AI Logs",
      description: "View AI conversation logs and analytics",
      hoverColor: "group-hover:text-green-600 dark:group-hover:text-green-300",
      section: "management",
    },
    {
      id: "ai-prompts",
      href: "/admin/prompts",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
          <Sparkles className="h-6 w-6" />
        </div>
      ),
      title: "AI Prompts",
      description: "Manage AI prompts for grading and voice conversation",
      hoverColor: "group-hover:text-cyan-600 dark:group-hover:text-cyan-300",
      stat: stats ? `${stats.prompts} ${stats.prompts === 1 ? "prompt" : "prompts"}` : undefined,
      section: "management",
    },
    {
      id: "content",
      href: "/admin/content",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
        </div>
      ),
      title: "Content Management",
      description: "Upload videos, batch assign, move content",
      hoverColor: "group-hover:text-orange-600 dark:group-hover:text-orange-300",
      section: "management",
    },
    {
      id: "exercises",
      href: "/admin/exercises",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <ClipboardList className="h-6 w-6" />
        </div>
      ),
      title: "Practice Exercises",
      description: "Create and manage practice exercises for students",
      hoverColor: "group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
      stat: stats
        ? `${stats.practiceSets} ${stats.practiceSets === 1 ? "practice set" : "practice sets"}`
        : undefined,
      section: "management",
    },
    {
      id: "knowledge",
      href: "/admin/knowledge",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
          <BookOpen className="h-6 w-6" />
        </div>
      ),
      title: "Knowledge Base",
      description: "Manage knowledge entries and file uploads for AI chatbot",
      hoverColor: "group-hover:text-teal-600 dark:group-hover:text-teal-300",
      stat: stats
        ? `${stats.kbEntries} ${stats.kbEntries === 1 ? "entry" : "entries"}`
        : undefined,
      section: "management",
    },
    {
      id: "accelerator",
      href: "/admin/accelerator/typing",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <Zap className="h-6 w-6" />
        </div>
      ),
      title: "Mandarin Accelerator",
      description: "Manage typing drills, conversation scripts, and curated passages for LTO students",
      hoverColor: "group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
      section: "management",
    },
    {
      id: "ghl",
      href: "/admin/ghl",
      icon: (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
          <Link2 className="h-6 w-6" />
        </div>
      ),
      title: "GHL Integration",
      description: "Manage GoHighLevel CRM connection, field mappings, and sync events",
      hoverColor: "group-hover:text-indigo-600 dark:group-hover:text-indigo-300",
      section: "integrations",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="mt-2 text-muted-foreground">
          Welcome back, {displayName}. Manage your LMS content and users.
        </p>
      </div>

      <AdminDashboardGrid tiles={tiles} />
    </div>
  );
}
