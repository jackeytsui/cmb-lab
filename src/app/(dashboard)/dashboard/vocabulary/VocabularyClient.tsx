"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Bookmark, Brain, Check, Search, Trash2, Volume2 } from "lucide-react";
import { useTTS } from "@/hooks/useTTS";
import type { SavedVocabulary } from "@/db/schema/vocabulary";

// ============================================================
// Types
// ============================================================

interface VocabularyClientProps {
  items: SavedVocabulary[];
}

// ============================================================
// Component
// ============================================================

/**
 * Client component rendering the saved vocabulary list.
 *
 * Features:
 * - Client-side search filter across traditional, simplified, pinyin, jyutping, definitions
 * - TTS playback via shared useTTS hook instance
 * - Optimistic delete with rollback on failure
 * - Empty state with guidance to the Reader
 */
export function VocabularyClient({ items: initialItems }: VocabularyClientProps) {
  const [items, setItems] = useState(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingToSrsId, setAddingToSrsId] = useState<string | null>(null);
  const [addedToSrs, setAddedToSrs] = useState<Set<string>>(new Set());
  const { speak, isLoading: ttsLoading, isPlaying } = useTTS();

  // --- Filtered items ---

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const fields = [
        item.traditional,
        item.simplified,
        item.pinyin,
        item.jyutping,
        ...(item.definitions ?? []),
      ];
      return fields.some((f) => f?.toLowerCase().includes(q));
    });
  }, [items, searchQuery]);

  // --- Delete handler with optimistic removal ---

  const handleDelete = useCallback(
    async (id: string) => {
      // Optimistic: remove from local state immediately
      const previousItems = items;
      setItems((prev) => prev.filter((item) => item.id !== id));
      setDeletingId(id);

      try {
        const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          // Rollback on failure
          setItems(previousItems);
        }
      } catch {
        // Rollback on network error
        setItems(previousItems);
      } finally {
        setDeletingId(null);
      }
    },
    [items]
  );

  // --- TTS handler ---

  const handleSpeak = useCallback(
    (text: string) => {
      speak(text, { language: "zh-CN" });
    },
    [speak]
  );

  const handleAddToSrs = useCallback(async (item: SavedVocabulary) => {
    setAddingToSrsId(item.id);
    try {
      const res = await fetch("/api/srs/cards/from-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedVocabularyId: item.id }),
      });
      if (res.ok) {
        setAddedToSrs((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
      }
    } finally {
      setAddingToSrsId(null);
    }
  }, []);

  // --- Empty state ---

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bookmark className="h-12 w-12 text-zinc-600 mb-4" />
        <h2 className="text-lg font-semibold text-zinc-300 mb-2">
          No saved vocabulary yet
        </h2>
        <p className="text-sm text-zinc-500 max-w-sm mb-6">
          Open the Reader and tap the bookmark icon on any word to save it here
          for review.
        </p>
        <Link
          href="/dashboard/reader"
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
        >
          Go to Reader
        </Link>
      </div>
    );
  }

  // --- Word count display ---

  const isFiltered = searchQuery.trim().length > 0;
  const countText = isFiltered
    ? `${filteredItems.length} of ${items.length} words`
    : `${items.length} word${items.length !== 1 ? "s" : ""}`;

  return (
    <>
      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by character, pinyin, jyutping, or definition..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
        />
      </div>

      {/* Word count */}
      <p className="text-xs text-zinc-500">{countText}</p>

      {/* Vocabulary cards */}
      {filteredItems.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">
          No words match your search.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors"
            >
              {/* Left: Characters */}
              <div className="min-w-[60px] shrink-0">
                <p className="text-xl font-bold text-zinc-100">
                  {item.traditional}
                </p>
                {item.simplified !== item.traditional && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    ({item.simplified})
                  </p>
                )}
              </div>

              {/* Middle: Pronunciation + definitions */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                  {item.pinyin && (
                    <span className="text-cyan-400">{item.pinyin}</span>
                  )}
                  {item.jyutping && (
                    <span className="text-amber-400">{item.jyutping}</span>
                  )}
                </div>
                {item.definitions && item.definitions.length > 0 && (
                  <p className="text-sm text-zinc-300 mt-1 line-clamp-2">
                    {item.definitions.join(", ")}
                  </p>
                )}
              </div>

              {/* Right: Date + actions */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-600 hidden sm:inline">
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString()
                    : ""}
                </span>

                {/* TTS play button */}
                <button
                  type="button"
                  onClick={() => handleSpeak(item.traditional)}
                  disabled={ttsLoading || isPlaying}
                  className="rounded-md p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  aria-label={`Play pronunciation of ${item.traditional}`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>

                {/* Add to SRS */}
                <button
                  type="button"
                  onClick={() => handleAddToSrs(item)}
                  disabled={addingToSrsId === item.id || addedToSrs.has(item.id)}
                  className="rounded-md p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  aria-label={`Add ${item.traditional} to SRS`}
                >
                  {addedToSrs.has(item.id) ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Brain className="h-4 w-4" />
                  )}
                </button>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="rounded-md p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  aria-label={`Remove ${item.traditional} from vocabulary`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
