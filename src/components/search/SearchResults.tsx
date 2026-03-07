"use client";

import { useRouter } from "next/navigation";

export interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  type: "course" | "lesson";
  courseId?: string;
  courseTitle?: string;
  relevance: number;
}

interface SearchResultsProps {
  results: SearchResult[];
  onSelect: () => void;
}

export function SearchResults({ results, onSelect }: SearchResultsProps) {
  const router = useRouter();

  if (results.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 mt-2 max-h-80 overflow-y-auto">
      <div className="divide-y divide-zinc-700">
        {results.map((result) => (
          <button
            key={`${result.type}-${result.id}`}
            type="button"
            className="w-full text-left px-3 py-2.5 hover:bg-zinc-700 transition-colors cursor-pointer"
            onClick={() => {
              const path =
                result.type === "course"
                  ? `/courses/${result.id}`
                  : `/courses/${result.courseId}`;
              router.push(path);
              onSelect();
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                  result.type === "course"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {result.type}
              </span>
              <span className="text-sm font-medium text-white truncate">
                {result.title}
              </span>
            </div>
            {result.description && (
              <p className="text-sm text-zinc-400 line-clamp-1 mt-0.5 ml-[calc(1.5rem+0.5rem)]">
                {result.description}
              </p>
            )}
            {result.type === "lesson" && result.courseTitle && (
              <p className="text-xs text-zinc-500 mt-0.5 ml-[calc(1.5rem+0.5rem)]">
                {result.courseTitle}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
