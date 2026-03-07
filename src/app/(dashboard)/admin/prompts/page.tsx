import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PromptList } from "@/components/admin/PromptList";
import { ChevronRight, Sparkles } from "lucide-react";

/**
 * Admin AI Prompts page - displays list of all AI prompts with type filtering.
 *
 * Features:
 * - View all AI prompts in the system
 * - Filter prompts by type (Voice AI, Text Grading, etc.)
 * - Click to view/edit prompt details
 *
 * Access Control:
 * - Requires coach or admin role
 * - Students are redirected to dashboard
 */
export default async function AdminPromptsPage() {
  // Verify user has coach or admin role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Fetch all prompts
  const promptList = await db
    .select({
      id: aiPrompts.id,
      slug: aiPrompts.slug,
      name: aiPrompts.name,
      type: aiPrompts.type,
      description: aiPrompts.description,
      currentVersion: aiPrompts.currentVersion,
      updatedAt: aiPrompts.updatedAt,
    })
    .from(aiPrompts)
    .orderBy(asc(aiPrompts.name));

  // Format for client component
  const prompts = promptList.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    description: p.description,
    currentVersion: p.currentVersion,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const total = prompts.length;

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">AI Prompts</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold">AI Prompts</h1>
          </div>
          <p className="text-zinc-400">
            {total} {total === 1 ? "prompt" : "prompts"} configured. Click a
            prompt to view and edit its content.
          </p>
        </header>

        {/* Prompt list */}
        <section aria-label="Prompt List">
          <PromptList initialPrompts={prompts} />
        </section>
    </div>
  );
}
