"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminAssessmentsClient() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"placement" | "hsk_mock" | "custom">("custom");
  const [hskLevel, setHskLevel] = useState(1);
  const [questionsJson, setQuestionsJson] = useState("[]");
  const [items, setItems] = useState<Array<{ id: string; title: string; type: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/assessments");
      if (res.ok) {
        const data = await res.json();
        setItems((data.assessments ?? []).map((a: { id: string; title: string; type: string }) => ({ id: a.id, title: a.title, type: a.type })));
      }
    } catch {
      // Non-critical: list may show empty
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAssessment() {
    setError(null);
    let questions: unknown[] = [];
    try {
      questions = JSON.parse(questionsJson);
    } catch {
      setError("Invalid JSON in questions field.");
      return;
    }

    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, type, hskLevel, questions }),
      });

      if (res.ok) {
        setTitle("");
        setDescription("");
        setQuestionsJson("[]");
        await load();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to create assessment.");
      }
    } catch {
      setError("Network error. Try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assessment title" />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100"
          placeholder="Description"
        />
        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "placement" | "hsk_mock" | "custom")}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
          >
            <option value="custom">Custom</option>
            <option value="placement">Placement</option>
            <option value="hsk_mock">HSK Mock</option>
          </select>
          <Input
            type="number"
            min={1}
            max={6}
            value={hskLevel}
            onChange={(e) => setHskLevel(Number(e.target.value))}
            className="w-28"
          />
        </div>
        <textarea
          value={questionsJson}
          onChange={(e) => setQuestionsJson(e.target.value)}
          className="min-h-40 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-100"
          placeholder='Question JSON array. Example: [{"prompt":"...","type":"multiple_choice","definition":{"type":"multiple_choice","question":"...","options":[...],"correctOptionId":"a"}}]'
        />
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        <Button onClick={createAssessment}>Create Assessment</Button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-lg font-semibold text-zinc-100">Existing Assessments</h2>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
              {item.title} <span className="text-xs text-zinc-500">({item.type})</span>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-zinc-500">No assessments yet.</li>}
        </ul>
      </div>
    </div>
  );
}
