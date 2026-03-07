"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText } from "lucide-react";

interface Prompt {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  currentVersion: number;
  updatedAt: string;
}

interface PromptListProps {
  initialPrompts: Prompt[];
}

const typeLabels: Record<string, { label: string; color: string }> = {
  grading_text: {
    label: "Text Grading",
    color: "bg-cyan-500/10 text-cyan-400",
  },
  grading_audio: {
    label: "Audio Grading",
    color: "bg-purple-500/10 text-purple-400",
  },
  voice_ai: {
    label: "Voice AI",
    color: "bg-green-500/10 text-green-400",
  },
  chatbot: {
    label: "Chatbot",
    color: "bg-yellow-500/10 text-yellow-400",
  },
};

const filterOptions = [
  { key: "all", label: "All" },
  { key: "grading_text", label: "Text Grading" },
  { key: "grading_audio", label: "Audio Grading" },
  { key: "voice_ai", label: "Voice AI" },
  { key: "chatbot", label: "Chatbot" },
];

/**
 * PromptList component - displays AI prompts with type filtering.
 * Clicking a prompt navigates to its detail/edit page.
 */
export function PromptList({ initialPrompts }: PromptListProps) {
  const [filter, setFilter] = useState("all");

  // Filter prompts based on selected type
  const filteredPrompts = useMemo(() => {
    if (filter === "all") {
      return initialPrompts;
    }
    return initialPrompts.filter((p) => p.type === filter);
  }, [initialPrompts, filter]);

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === option.key
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Prompt cards */}
      {filteredPrompts.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid gap-4">
          {filteredPrompts.map((prompt) => {
            const typeConfig = typeLabels[prompt.type] || {
              label: prompt.type,
              color: "bg-zinc-500/10 text-zinc-400",
            };
            const updatedAgo = formatDistanceToNow(new Date(prompt.updatedAt), {
              addSuffix: true,
            });

            return (
              <Link
                key={prompt.id}
                href={`/admin/prompts/${prompt.id}`}
                className="block rounded-lg border border-zinc-700 bg-zinc-800 p-4 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-white truncate">
                      {prompt.name}
                    </h3>
                    {prompt.description && (
                      <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                        {prompt.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                      <span>v{prompt.currentVersion}</span>
                      <span>Updated {updatedAgo}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}
                  >
                    {typeConfig.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: string }) {
  const typeConfig = typeLabels[filter];
  const filterLabel = typeConfig?.label || filter;

  return (
    <div className="text-center py-16">
      <FileText className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        {filter === "all" ? "No prompts configured" : `No ${filterLabel} prompts`}
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        {filter === "all"
          ? "AI prompts will appear here once they are created."
          : `No prompts of type "${filterLabel}" have been configured yet.`}
      </p>
    </div>
  );
}
