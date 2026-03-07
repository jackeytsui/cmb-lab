"use client";

import { useEffect, useState } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminGrammarClient() {
  const [patterns, setPatterns] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [title, setTitle] = useState("");
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("general");
  const [hskLevel, setHskLevel] = useState(1);
  const [explanation, setExplanation] = useState("<p></p>");
  const [examples, setExamples] = useState("");
  const [translations, setTranslations] = useState("");
  const [mistakes, setMistakes] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadPatterns() {
    try {
      const res = await fetch("/api/grammar/patterns?includeDrafts=1");
      if (res.ok) {
        const data = await res.json();
        setPatterns((data.patterns ?? []).map((p: { id: string; title: string; status: string }) => ({ id: p.id, title: p.title, status: p.status })));
      }
    } catch {
      // Non-critical: pattern list may show empty
    }
  }

  useEffect(() => {
    loadPatterns();
  }, []);

  async function handleGenerate() {
    if (!title.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/grammar/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: title, hskLevel, languageHint: "Mandarin + Cantonese" }),
      });
      if (res.ok) {
        const data = await res.json();
        const draft = data.draft ?? {};
        setPattern(draft.pattern ?? pattern);
        setExplanation(draft.explanation ?? explanation);
        setExamples((draft.examples ?? []).join("\n"));
        setTranslations((draft.translations ?? []).join("\n"));
        setMistakes((draft.mistakes ?? []).join("\n"));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(status: "draft" | "published") {
    if (!title.trim() || !pattern.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/grammar/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          pattern,
          category,
          hskLevel,
          explanation,
          examples: examples.split("\n").map((s) => s.trim()).filter(Boolean),
          translations: translations.split("\n").map((s) => s.trim()).filter(Boolean),
          mistakes: mistakes.split("\n").map((s) => s.trim()).filter(Boolean),
          status,
          aiGenerated: generating,
        }),
      });
      if (res.ok) {
        setTitle("");
        setPattern("");
        setExplanation("<p></p>");
        setExamples("");
        setTranslations("");
        setMistakes("");
        await loadPatterns();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Pattern" />
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">HSK Level</label>
          <select
            value={hskLevel}
            onChange={(e) => setHskLevel(Number(e.target.value))}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
          >
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <Button variant="outline" onClick={handleGenerate} disabled={generating || !title.trim()}>
            {generating ? "Generating..." : "Generate AI Draft"}
          </Button>
        </div>

        <RichTextEditor value={explanation} onChange={setExplanation} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <textarea
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            placeholder="Examples (one per line)"
            className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
          <textarea
            value={translations}
            onChange={(e) => setTranslations(e.target.value)}
            placeholder="Translations (one per line)"
            className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
          <textarea
            value={mistakes}
            onChange={(e) => setMistakes(e.target.value)}
            placeholder="Common mistakes (one per line)"
            className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => handleSave("draft")} disabled={saving}>Save Draft</Button>
          <Button variant="secondary" onClick={() => handleSave("published")} disabled={saving}>Publish</Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-lg font-semibold text-zinc-100">Existing Patterns</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {patterns.map((item) => (
            <li key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-zinc-300">
              {item.title} <span className="ml-2 text-xs text-zinc-500">({item.status})</span>
            </li>
          ))}
          {patterns.length === 0 && <li className="text-zinc-500">No patterns created yet.</li>}
        </ul>
      </div>
    </div>
  );
}
