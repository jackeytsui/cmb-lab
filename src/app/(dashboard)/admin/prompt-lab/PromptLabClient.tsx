"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type PromptCase = {
  id: string;
  title: string;
  input: string;
  expectedPattern: string | null;
};

export default function PromptLabClient() {
  const [promptA, setPromptA] = useState("You are a Chinese tutor. Reply with concise feedback.");
  const [promptB, setPromptB] = useState("You are a Chinese tutor. Reply with detailed corrections and examples.");
  const [input, setInput] = useState("Student answer sample");
  const [title, setTitle] = useState("");
  const [expectedPattern, setExpectedPattern] = useState("");
  const [cases, setCases] = useState<PromptCase[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [result, setResult] = useState<{ outputA: string; outputB?: string; passCount: number; totalCases: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCases() {
    try {
      const res = await fetch("/api/admin/prompt-lab/cases");
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases ?? []);
      }
    } catch {
      // Non-critical: cases list may show empty
    }
  }

  useEffect(() => {
    loadCases();
  }, []);

  const selectedInput = useMemo(() => {
    if (selectedCaseIds.length === 1) {
      return cases.find((c) => c.id === selectedCaseIds[0])?.input ?? input;
    }
    return input;
  }, [cases, input, selectedCaseIds]);

  async function addCase() {
    if (!title.trim() || !input.trim()) return;
    try {
      const res = await fetch("/api/admin/prompt-lab/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, input, expectedPattern }),
      });

      if (res.ok) {
        setTitle("");
        setExpectedPattern("");
        await loadCases();
      }
    } catch {
      // Non-critical
    }
  }

  async function runTest() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prompt-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptA,
          promptB,
          input: selectedInput,
          caseIds: selectedCaseIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({
          outputA: data.outputA,
          outputB: data.outputB,
          passCount: data.passCount,
          totalCases: data.totalCases,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleCase(caseId: string) {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <textarea
          value={promptA}
          onChange={(e) => setPromptA(e.target.value)}
          className="min-h-40 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
          placeholder="Prompt A"
        />
        <textarea
          value={promptB}
          onChange={(e) => setPromptB(e.target.value)}
          className="min-h-40 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
          placeholder="Prompt B"
        />
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
        placeholder="Sample input"
      />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Test Cases</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
            placeholder="Case title"
          />
          <input
            value={expectedPattern}
            onChange={(e) => setExpectedPattern(e.target.value)}
            className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
            placeholder="Expected keyword/pattern"
          />
          <Button onClick={addCase}>Save Case</Button>
        </div>

        <div className="space-y-2">
          {cases.map((testCase) => (
            <label key={testCase.id} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={selectedCaseIds.includes(testCase.id)}
                onChange={() => toggleCase(testCase.id)}
              />
              <span>{testCase.title}</span>
              {testCase.expectedPattern && <span className="text-xs text-zinc-500">expect: {testCase.expectedPattern}</span>}
            </label>
          ))}
          {cases.length === 0 && <p className="text-sm text-zinc-500">No test cases saved yet.</p>}
        </div>
      </div>

      <Button onClick={runTest} disabled={loading || !promptA.trim() || !selectedInput.trim()}>
        {loading ? "Running..." : "Run A/B Test"}
      </Button>

      {result && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Output A</h3>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">{result.outputA}</pre>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Output B</h3>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">{result.outputB || "No Prompt B"}</pre>
          </div>
          <div className="lg:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
            Batch Result: {result.passCount}/{result.totalCases || selectedCaseIds.length} cases passed.
          </div>
        </div>
      )}
    </div>
  );
}
