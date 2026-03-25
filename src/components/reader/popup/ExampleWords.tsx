"use client";

/**
 * ExampleWords — List of example words containing the selected character.
 *
 * Shows up to 8 examples with traditional characters, pinyin, and
 * truncated definitions. Displays a "no examples" message when empty.
 */

export interface ExampleWordEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  pinyinDisplay: string;
  definitions: string[];
  source: string;
}

export interface ExampleWordsProps {
  examples: ExampleWordEntry[];
}

const MAX_EXAMPLES = 8;

export function ExampleWords({ examples }: ExampleWordsProps) {
  const visible = examples.slice(0, MAX_EXAMPLES);

  return (
    <div className="px-3 py-2">
      <h4 className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
        Example Words
      </h4>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No example words found</p>
      ) : (
        <div className="space-y-1">
          {visible.map((example, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">
                {example.traditional}
              </span>
              <span className="text-xs text-amber-400">
                {example.pinyinDisplay}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {example.definitions.filter((d: string) => !d.startsWith("CL:")).slice(0, 2).join("; ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
