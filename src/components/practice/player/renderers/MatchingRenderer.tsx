"use client";

import { useState, useMemo, useCallback } from "react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { MatchingDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface MatchingRendererProps {
  definition: MatchingDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { pairs: { leftId: string; rightId: string }[] }) => void;
  disabled?: boolean;
  savedAnswer?: { pairs: { leftId: string; rightId: string }[] };
}

// ============================================================
// Deterministic shuffle (seeded PRNG, same as ExercisePreview)
// ============================================================

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================
// Match pair colors (6 distinct colors for visual distinction)
// ============================================================

const MATCH_COLORS = [
  { bg: "bg-blue-500/20", border: "border-blue-500", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/20", border: "border-emerald-500", dot: "bg-emerald-500" },
  { bg: "bg-purple-500/20", border: "border-purple-500", dot: "bg-purple-500" },
  { bg: "bg-amber-500/20", border: "border-amber-500", dot: "bg-amber-500" },
  { bg: "bg-rose-500/20", border: "border-rose-500", dot: "bg-rose-500" },
  { bg: "bg-cyan-500/20", border: "border-cyan-500", dot: "bg-cyan-500" },
] as const;

// ============================================================
// MatchingRenderer
// ============================================================

export function MatchingRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
  savedAnswer,
}: MatchingRendererProps) {
  // Matches: leftId -> rightId
  const [matches, setMatches] = useState<Map<string, string>>(() => {
    if (savedAnswer?.pairs) {
      const map = new Map();
      savedAnswer.pairs.forEach((p) => map.set(p.leftId, p.rightId));
      return map;
    }
    return new Map();
  });
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  // Shuffle left and right columns with different seeds, memoized
  const leftItems = useMemo(
    () => shuffleArray(definition.pairs, definition.pairs.length * 7),
    [definition.pairs]
  );
  const rightItems = useMemo(
    () => shuffleArray(definition.pairs, definition.pairs.length * 13),
    [definition.pairs]
  );

  // Build a reverse map: rightId -> leftId for bidirectional lookup
  const reverseMatches = useMemo(() => {
    const rev = new Map<string, string>();
    matches.forEach((rightId, leftId) => {
      rev.set(rightId, leftId);
    });
    return rev;
  }, [matches]);

  // Assign a color index to each matched left item based on insertion order
  const matchColorMap = useMemo(() => {
    const colorMap = new Map<string, number>();
    let colorIndex = 0;
    matches.forEach((_rightId, leftId) => {
      colorMap.set(leftId, colorIndex % MATCH_COLORS.length);
      colorIndex++;
    });
    return colorMap;
  }, [matches]);

  const allMatched = matches.size >= definition.pairs.length;

  // ----------------------------------------------------------
  // Click handlers
  // ----------------------------------------------------------

  const handleLeftClick = useCallback(
    (leftId: string) => {
      if (disabled) return;

      // If this left item is already matched, clear its match and select it
      if (matches.has(leftId)) {
        setMatches((prev) => {
          const next = new Map(prev);
          next.delete(leftId);
          return next;
        });
        setSelectedLeft(leftId);
        return;
      }

      // Select (or deselect if clicking same)
      setSelectedLeft((prev) => (prev === leftId ? null : leftId));
    },
    [disabled, matches]
  );

  const handleRightClick = useCallback(
    (rightId: string) => {
      if (disabled) return;

      // If no left selected:
      // If this right is already matched, clear that match
      if (selectedLeft === null) {
        const matchedLeftId = reverseMatches.get(rightId);
        if (matchedLeftId) {
          setMatches((prev) => {
            const next = new Map(prev);
            next.delete(matchedLeftId);
            return next;
          });
        }
        return;
      }

      // Create a match: selectedLeft -> rightId
      setMatches((prev) => {
        const next = new Map(prev);

        // Bidirectional dedup: if rightId is already matched to another leftId, remove that
        const existingLeftForRight = Array.from(next.entries()).find(
          ([, rId]) => rId === rightId
        );
        if (existingLeftForRight) {
          next.delete(existingLeftForRight[0]);
        }

        // Remove any existing match for the selected left (already cleared on select, but be safe)
        // Set the new match
        next.set(selectedLeft, rightId);
        return next;
      });

      setSelectedLeft(null);
    },
    [disabled, selectedLeft, reverseMatches]
  );

  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------

  function handleSubmit() {
    if (!allMatched || disabled) return;
    const pairs = Array.from(matches.entries()).map(([leftId, rightId]) => ({
      leftId,
      rightId,
    }));
    onSubmit({ pairs });
  }

  // ----------------------------------------------------------
  // Helper: get color for a left item
  // ----------------------------------------------------------

  function getMatchColor(leftId: string) {
    const colorIdx = matchColorMap.get(leftId);
    if (colorIdx === undefined) return null;
    return MATCH_COLORS[colorIdx];
  }

  function getMatchColorForRight(rightId: string) {
    const leftId = reverseMatches.get(rightId);
    if (!leftId) return null;
    return getMatchColor(leftId);
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Instruction */}
      <p className="text-sm text-zinc-400">
        Click a left item, then a right item to match them
      </p>

      {/* Two columns */}
      <div className="flex gap-4">
        {/* Left column */}
        <div className="flex flex-1 flex-col gap-2">
          {leftItems.map((pair) => {
            const isSelected = selectedLeft === pair.id;
            const color = getMatchColor(pair.id);
            const isMatched = matches.has(pair.id);

            return (
              <button
                key={pair.id + "-left"}
                type="button"
                disabled={disabled}
                onClick={() => handleLeftClick(pair.id)}
                className={`relative flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition ${
                  isSelected
                    ? "ring-2 ring-blue-500 bg-zinc-800 text-white"
                    : isMatched && color
                      ? `${color.bg} ${color.border} border-l-4 text-zinc-200`
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                {/* Color dot indicator for matched items */}
                {isMatched && color && (
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${color.dot}`}
                  />
                )}
                <PhoneticText forceLanguage={forceLanguage}>
                  {pair.left}
                </PhoneticText>
              </button>
            );
          })}
        </div>

        {/* Right column */}
        <div className="flex flex-1 flex-col gap-2">
          {rightItems.map((pair) => {
            const color = getMatchColorForRight(pair.id);
            const isMatched = reverseMatches.has(pair.id);

            return (
              <button
                key={pair.id + "-right"}
                type="button"
                disabled={disabled}
                onClick={() => handleRightClick(pair.id)}
                className={`relative flex w-full items-center justify-end gap-3 rounded-lg px-4 py-3 text-right text-sm transition ${
                  isMatched && color
                    ? `${color.bg} ${color.border} border-r-4 text-zinc-200`
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <PhoneticText forceLanguage={forceLanguage}>
                  {pair.right}
                </PhoneticText>
                {/* Color dot indicator for matched items */}
                {isMatched && color && (
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${color.dot}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!allMatched || disabled}
          onClick={handleSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Matches
        </button>
      </div>
    </div>
  );
}
