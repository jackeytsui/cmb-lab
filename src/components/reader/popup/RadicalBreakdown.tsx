"use client";

/**
 * RadicalBreakdown — Shows radical, decomposition, and etymology information.
 *
 * Displays:
 *   - Radical character with meaning and stroke count
 *   - Unicode decomposition string (e.g. "⿰亻尔")
 *   - Etymology type badge with hint text
 *   - Semantic/phonetic components for pictophonetic characters
 */

export interface RadicalBreakdownProps {
  radical: string;
  radicalMeaning: string | null;
  decomposition: string;
  etymologyType: string | null;
  etymologyHint: string | null;
  etymologyPhonetic: string | null;
  etymologySemantic: string | null;
  strokeCount: number;
}

/** Badge styling for each etymology type */
const ETYMOLOGY_BADGE_STYLES: Record<string, string> = {
  pictographic: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ideographic: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  pictophonetic: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export function RadicalBreakdown({
  radical,
  radicalMeaning,
  decomposition,
  etymologyType,
  etymologyHint,
  etymologyPhonetic,
  etymologySemantic,
  strokeCount,
}: RadicalBreakdownProps) {
  return (
    <div className="space-y-2 px-3 py-2">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        Character Breakdown
      </h4>

      {/* Row 1: Radical + meaning + stroke count */}
      <div className="flex items-center gap-2">
        <span className="text-2xl text-cyan-400">{radical}</span>
        {radicalMeaning && (
          <span className="text-sm text-muted-foreground">({radicalMeaning})</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {strokeCount} stroke{strokeCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Row 2: Decomposition */}
      {decomposition && (
        <div className="border-t border-border/50 pt-2">
          <span className="text-xs text-muted-foreground">Decomposition: </span>
          <span className="text-sm text-foreground/80">{decomposition}</span>
        </div>
      )}

      {/* Row 3: Etymology */}
      {etymologyType && (
        <div className="border-t border-border/50 pt-2">
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                ETYMOLOGY_BADGE_STYLES[etymologyType] ??
                "bg-muted/40 text-muted-foreground border-border/40"
              }`}
            >
              {etymologyType}
            </span>
            {etymologyHint && (
              <span className="text-xs text-muted-foreground">{etymologyHint}</span>
            )}
          </div>

          {/* Pictophonetic: show semantic + phonetic components */}
          {etymologyType === "pictophonetic" &&
            (etymologySemantic || etymologyPhonetic) && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {etymologySemantic && (
                  <span>
                    Semantic:{" "}
                    <span className="font-medium text-foreground/90">
                      {etymologySemantic}
                    </span>
                  </span>
                )}
                {etymologyPhonetic && (
                  <span>
                    Phonetic:{" "}
                    <span className="font-medium text-foreground/90">
                      {etymologyPhonetic}
                    </span>
                  </span>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
