"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpen } from "lucide-react";

interface Entry {
  id: string;
  title: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
}

interface KbEntryListProps {
  entries: Entry[];
  categories: Category[];
}

/**
 * Client component for knowledge base entry list with category filter tabs.
 * Renders filter tabs and entry cards with status/category badges.
 */
export function KbEntryList({ entries, categories }: KbEntryListProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    if (activeCategory === "all") return entries;
    return entries.filter((e) => e.categoryId === activeCategory);
  }, [entries, activeCategory]);

  return (
    <div className="space-y-6">
      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === cat.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Entry cards */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          isFiltered={activeCategory !== "all"}
          categoryName={
            categories.find((c) => c.id === activeCategory)?.name || ""
          }
        />
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map((entry) => {
            const updatedAgo = formatDistanceToNow(new Date(entry.updatedAt), {
              addSuffix: true,
            });

            return (
              <Link
                key={entry.id}
                href={`/admin/knowledge/${entry.id}`}
                className="block rounded-lg border border-zinc-700 bg-zinc-800 p-4 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-white truncate">
                      {entry.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                      <span>Updated {updatedAgo}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.categoryName && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400">
                        {entry.categoryName}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        entry.status === "published"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  isFiltered,
  categoryName,
}: {
  isFiltered: boolean;
  categoryName: string;
}) {
  return (
    <div className="text-center py-16">
      <BookOpen className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        {isFiltered
          ? `No entries in "${categoryName}"`
          : "No knowledge entries yet"}
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        {isFiltered
          ? "No entries have been assigned to this category."
          : "Create your first entry to start building the knowledge base."}
      </p>
    </div>
  );
}
