import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbCategories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ChevronRight, ArrowLeft, BookOpen } from "lucide-react";
import { KbEntryForm } from "@/components/admin/KbEntryForm";
import { ErrorAlert } from "@/components/ui/error-alert";

/**
 * Create new knowledge base entry page.
 *
 * Access Control:
 * - Requires coach or admin role
 */
export default async function NewKnowledgeEntryPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Fetch categories for the dropdown
  let categories: { id: string; name: string }[] = [];
  let categoryError: string | null = null;

  try {
    categories = await db
      .select({
        id: kbCategories.id,
        name: kbCategories.name,
      })
      .from(kbCategories)
      .orderBy(asc(kbCategories.sortOrder));
  } catch (err) {
    console.error("Failed to load knowledge base categories:", err);
    categoryError = "Failed to load categories. You can still create an entry without a category.";
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link
            href="/admin/knowledge"
            className="hover:text-white transition-colors"
          >
            Knowledge Base
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">New Entry</span>
        </nav>

        {/* Back button */}
        <Link
          href="/admin/knowledge"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Knowledge Base
        </Link>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold">New Knowledge Entry</h1>
          </div>
          <p className="text-zinc-400">
            Create a new entry for the knowledge base. Content will be
            automatically chunked for AI retrieval.
          </p>
        </header>

        {/* Category fetch warning */}
        {categoryError && (
          <div className="mb-6">
            <ErrorAlert message={categoryError} />
          </div>
        )}

        {/* Form */}
        <KbEntryForm mode="create" categories={categories} />
    </div>
  );
}
