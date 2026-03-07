"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, ArrowLeft } from "lucide-react";

interface MatchingChunk {
  chunkId: string;
  content: string;
  chunkIndex: number;
}

interface SearchResult {
  entryId: string;
  entryTitle: string;
  categoryName: string | null;
  matchingChunks: MatchingChunk[];
  matchCount: number;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
}

interface Category {
  id: string;
  name: string;
}

/**
 * Highlight search term in text using <mark> tags (case-insensitive).
 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Truncate text to maxLength characters, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

export function SearchPageClient() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/admin/knowledge/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch {
        // Categories are optional, fail silently
      }
    }
    fetchCategories();
  }, []);

  const performSearch = useCallback(
    async (searchQuery: string, catId: string) => {
      if (searchQuery.trim().length < 2) {
        setResults(null);
        setSearchedQuery("");
        return;
      }

      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          limit: "20",
        });
        if (catId) {
          params.set("categoryId", catId);
        }

        const res = await fetch(`/api/knowledge/search?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("Search failed");
        }

        const data: SearchResponse = await res.json();
        setResults(data.results);
        setSearchedQuery(data.query);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Cancelled, ignore
        }
        console.error("Search error:", err);
        setSearchError("Failed to search knowledge base. Please try again.");
        setSearchedQuery(searchQuery.trim());
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search on query or category change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(query, categoryId);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, categoryId, performSearch]);

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/knowledge"
            className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Base
          </Link>
          <h1 className="text-3xl font-bold">Search Knowledge Base</h1>
          <p className="mt-2 text-zinc-400">
            Search across all published knowledge base entries and chunks.
          </p>
        </div>

        {/* Search controls */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge base entries..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-4 pl-12 text-lg text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              autoFocus
            />
          </div>
          {categories.length > 0 && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-zinc-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Results area */}
        <div>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
            </div>
          )}

          {!loading && searchError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-4">
              <p className="text-sm text-red-400">{searchError}</p>
              <button
                onClick={() => performSearch(query, categoryId)}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !searchError && results === null && (
            <p className="py-12 text-center text-zinc-500">
              Enter a search term to find knowledge base entries
            </p>
          )}

          {!loading && !searchError && results !== null && results.length === 0 && (
            <p className="py-12 text-center text-zinc-500">
              No results found for &quot;{searchedQuery}&quot;
            </p>
          )}

          {!loading && !searchError && results !== null && results.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                {results.length} result{results.length !== 1 ? "s" : ""} for
                &quot;{searchedQuery}&quot;
              </p>

              {results.map((result) => (
                <div
                  key={result.entryId}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-6"
                >
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <Link
                      href={`/admin/knowledge/${result.entryId}`}
                      className="text-lg font-semibold text-white hover:text-blue-400"
                    >
                      {highlightText(result.entryTitle, searchedQuery)}
                    </Link>
                    {result.categoryName && (
                      <span className="shrink-0 rounded-full bg-zinc-700 px-3 py-1 text-xs text-zinc-300">
                        {result.categoryName}
                      </span>
                    )}
                  </div>

                  {result.matchCount > 0 && (
                    <p className="mb-3 text-sm text-zinc-400">
                      {result.matchCount} matching section
                      {result.matchCount !== 1 ? "s" : ""}
                    </p>
                  )}

                  {result.matchingChunks.length > 0 && (
                    <div className="text-sm text-zinc-300">
                      {highlightText(
                        truncate(result.matchingChunks[0].content, 200),
                        searchedQuery
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
