"use client";

import { AlignedLanguageText } from "@/components/language/AlignedLanguageText";

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
            <AlignedLanguageText
              key={i}
              chinese={example.traditional}
              pinyin={example.pinyinDisplay}
              english={example.definitions
                .filter((definition: string) => !definition.startsWith("CL:"))
                .slice(0, 2)
                .join("; ")}
              fontSize={14}
              annotationSize={12}
              englishSize={12}
              chineseClassName="font-medium text-foreground"
              pinyinClassName="text-amber-400"
              englishClassName="truncate"
            />
          ))}
        </div>
      )}
    </div>
  );
}
