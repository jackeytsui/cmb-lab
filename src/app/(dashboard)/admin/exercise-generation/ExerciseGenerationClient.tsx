"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ExerciseGenerationClient() {
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("Generated Practice Set");
  const [saveAsDraft, setSaveAsDraft] = useState(true);
  const [result, setResult] = useState<{ exercises: unknown[]; saved?: boolean; practiceSetId?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/exercise-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText, title, saveAsDraft }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error ?? "Generation failed.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
          placeholder="Draft practice set title"
        />
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className="min-h-40 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100"
          placeholder="Paste lesson transcript or reader passage"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} />
          Save directly as draft practice set
        </label>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        <Button onClick={generate} disabled={loading || !sourceText.trim()}>
          {loading ? "Generating..." : "Generate Exercises"}
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Generated Output</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {result.exercises.length} exercises generated.
            {result.saved && result.practiceSetId ? ` Saved to draft practice set ${result.practiceSetId}.` : ""}
          </p>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            {JSON.stringify(result.exercises, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
