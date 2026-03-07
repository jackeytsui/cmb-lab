"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type GrammarPattern = {
  id: string;
  hskLevel: number;
  category: string;
  title: string;
  pattern: string;
  pinyin: string | null;
  explanation: string;
};

export default function GrammarLibraryClient() {
  const [patterns, setPatterns] = useState<GrammarPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hsk, setHsk] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (hsk !== "all") qs.set("hsk", hsk);

    fetch(`/api/grammar/patterns?${qs.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load grammar patterns");
        return res.json();
      })
      .then((data) => setPatterns(data.patterns ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, hsk]);

  const grouped = useMemo(() => {
    const map = new Map<number, GrammarPattern[]>();
    for (const p of patterns) {
      const list = map.get(p.hskLevel) ?? [];
      list.push(p);
      map.set(p.hskLevel, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [patterns]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by characters, pinyin, or English"
              className="pl-9"
            />
          </div>
          <select
            value={hsk}
            onChange={(e) => setHsk(e.target.value)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
          >
            <option value="all">All HSK levels</option>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <option key={level} value={String(level)}>
                HSK {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-400">Loading grammar patterns...</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
          No grammar patterns yet. Ask a coach to publish patterns from Admin Grammar.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([level, items]) => (
            <section key={level} className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-200">HSK {level}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {items.map((pattern) => (
                  <Link
                    key={pattern.id}
                    href={`/dashboard/grammar/${pattern.id}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700"
                  >
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <BookOpenText className="h-3.5 w-3.5" />
                      {pattern.category}
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-zinc-100">{pattern.title}</h3>
                    <p className="mt-1 text-sm text-cyan-300">{pattern.pattern}</p>
                    {pattern.pinyin && (
                      <p className="mt-1 text-xs text-amber-300">{pattern.pinyin}</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
