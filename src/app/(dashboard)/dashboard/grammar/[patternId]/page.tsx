"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bookmark, BookmarkCheck } from "lucide-react";

type GrammarPattern = {
  id: string;
  hskLevel: number;
  category: string;
  title: string;
  pattern: string;
  pinyin: string | null;
  explanation: string;
  examples: string[];
  translations: string[];
  mistakes: string[];
  cantoneseDiff: string | null;
};

export default function GrammarPatternPage() {
  const params = useParams<{ patternId: string }>();
  const [pattern, setPattern] = useState<GrammarPattern | null>(null);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    fetch("/api/grammar/patterns?includeDrafts=1")
      .then((res) => res.json())
      .then((data) => {
        const found = (data.patterns ?? []).find((p: GrammarPattern) => p.id === params.patternId);
        setPattern(found ?? null);
      });
  }, [params.patternId]);

  async function toggleBookmark() {
    if (!pattern) return;
    const method = bookmarked ? "DELETE" : "POST";
    const res = await fetch(`/api/grammar/patterns/${pattern.id}/bookmark`, { method });
    if (res.ok) setBookmarked((prev) => !prev);
  }

  const examples = useMemo(() => {
    if (!pattern) return [] as Array<{ sentence: string; translation: string }>;
    return pattern.examples.map((sentence, idx) => ({
      sentence,
      translation: pattern.translations[idx] ?? "",
    }));
  }, [pattern]);

  if (!pattern) {
    return <div className="container mx-auto px-4 py-8 text-zinc-400">Pattern not found.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/grammar" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Back to Grammar Library
        </Link>
        <button
          type="button"
          onClick={toggleBookmark}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4 text-emerald-400" /> : <Bookmark className="h-4 w-4" />}
          {bookmarked ? "Bookmarked" : "Bookmark"}
        </button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="text-xs uppercase tracking-wide text-zinc-500">HSK {pattern.hskLevel} • {pattern.category}</div>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">{pattern.title}</h1>
        <p className="mt-1 text-lg text-cyan-300">{pattern.pattern}</p>
        {pattern.pinyin && <p className="mt-1 text-sm text-amber-300">{pattern.pinyin}</p>}
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="text-lg font-semibold text-zinc-100">Explanation</h2>
        <div className="prose prose-invert mt-3 max-w-none" dangerouslySetInnerHTML={{ __html: pattern.explanation }} />
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="text-lg font-semibold text-zinc-100">Examples</h2>
        <ul className="mt-3 space-y-2">
          {examples.map((item, idx) => (
            <li key={idx} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-zinc-100">{item.sentence}</p>
              {item.translation && <p className="mt-1 text-sm text-zinc-400">{item.translation}</p>}
            </li>
          ))}
        </ul>
      </section>

      {!!pattern.cantoneseDiff && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Cantonese vs Mandarin</h2>
          <p className="mt-2 text-sm text-zinc-300">{pattern.cantoneseDiff}</p>
        </section>
      )}

      {pattern.mistakes.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Common Mistakes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {pattern.mistakes.map((mistake, idx) => (
              <li key={idx}>{mistake}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
