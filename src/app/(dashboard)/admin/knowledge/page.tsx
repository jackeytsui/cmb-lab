import { redirect } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbEntries, kbCategories } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { ChevronRight, BookOpen, Plus } from "lucide-react";
import { KbEntryList } from "./KbEntryList";
import { ErrorAlert } from "@/components/ui/error-alert";

/**
 * Admin Knowledge Base page - displays list of all KB entries with category filtering.
 *
 * Features:
 * - View all knowledge base entries
 * - Filter by category via tabs
 * - Status badges (published/draft)
 * - Click to edit entry
 * - New Entry button
 *
 * Access Control:
 * - Requires coach or admin role
 */
export default async function AdminKnowledgePage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  let entries: { id: string; title: string; status: string; categoryId: string | null; categoryName: string | null; updatedAt: string }[] = [];
  let categories: { id: string; name: string }[] = [];
  let fetchError: string | null = null;

  try {
    // Fetch entries and categories in parallel
    const [entryRows, categoryRows] = await Promise.all([
      db
        .select({
          id: kbEntries.id,
          title: kbEntries.title,
          status: kbEntries.status,
          categoryId: kbEntries.categoryId,
          categoryName: kbCategories.name,
          updatedAt: kbEntries.updatedAt,
        })
        .from(kbEntries)
        .leftJoin(kbCategories, eq(kbEntries.categoryId, kbCategories.id))
        .orderBy(desc(kbEntries.updatedAt)),
      db
        .select({
          id: kbCategories.id,
          name: kbCategories.name,
        })
        .from(kbCategories)
        .orderBy(asc(kbCategories.sortOrder)),
    ]);

    // Serialize dates for client component
    entries = entryRows.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      categoryId: e.categoryId,
      categoryName: e.categoryName,
      updatedAt: e.updatedAt.toISOString(),
    }));

    categories = categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
    }));
  } catch (err) {
    console.error("Failed to load knowledge base entries:", err);
    fetchError = "Failed to load knowledge base entries. Please try again later.";
  }

  const total = entries.length;

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">Knowledge Base</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-cyan-400" />
              </div>
              <h1 className="text-3xl font-bold">Knowledge Base</h1>
            </div>
            <Link
              href="/admin/knowledge/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Entry
            </Link>
          </div>
          {!fetchError && (
            <p className="text-zinc-400">
              {total} {total === 1 ? "entry" : "entries"} in the knowledge base.
            </p>
          )}
        </header>

        {/* Entry list with category filter */}
        <section aria-label="Knowledge Base Entries">
          {fetchError ? (
            <ErrorAlert message={fetchError} variant="block" />
          ) : (
            <KbEntryList entries={entries} categories={categories} />
          )}
        </section>
    </div>
  );
}
