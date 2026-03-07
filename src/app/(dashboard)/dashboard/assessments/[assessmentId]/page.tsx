"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Question = {
  id: string;
  prompt: string;
  type: string;
  definition: Record<string, unknown>;
  skillArea: string;
};

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  questions: Question[];
};

export default function AssessmentAttemptPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ score: number; estimatedHskLevel: number; sectionScores: Record<string, number> } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/assessments").then((res) => res.json()),
      fetch(`/api/assessments/${assessmentId}/attempts`).then((res) => res.json()),
    ]).then(([assessmentsData]) => {
      const found = (assessmentsData.assessments ?? []).find((a: Assessment) => a.id === assessmentId);
      if (!found) return;

      fetch(`/api/admin/exercise-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: found.description ?? found.title, saveAsDraft: false }),
      })
        .then((res) => res.json())
        .then((generated) => {
          const questions = (generated.exercises ?? []).slice(0, 10).map((exercise: { definition: Record<string, unknown>; type: string }, idx: number) => ({
            id: `${assessmentId}-q-${idx}`,
            prompt: String((exercise.definition.question as string) ?? (exercise.definition.sentence as string) ?? `Question ${idx + 1}`),
            type: exercise.type,
            definition: exercise.definition,
            skillArea: "vocabulary",
          }));
          setAssessment({ ...found, questions });
        });
    });
  }, [assessmentId]);

  async function submitAssessment() {
    const res = await fetch(`/api/assessments/${assessmentId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (res.ok) {
      const data = await res.json();
      setResult({
        score: data.attempt.score,
        estimatedHskLevel: data.estimatedHskLevel,
        sectionScores: data.sectionScores,
      });
    }
  }

  const questionCount = useMemo(() => assessment?.questions.length ?? 0, [assessment]);

  if (!assessment) {
    return <div className="container mx-auto px-4 py-8 text-zinc-400">Loading assessment...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{assessment.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{assessment.description || "Assessment"}</p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm text-zinc-400">{questionCount} questions generated for this attempt.</p>
      </div>

      <div className="space-y-3">
        {assessment.questions.map((q, idx) => (
          <div key={q.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs text-zinc-500">Question {idx + 1}</div>
            <p className="mt-2 text-sm text-zinc-100">{q.prompt}</p>
            <textarea
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              className="mt-3 min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100"
              placeholder="Type your answer"
            />
          </div>
        ))}
      </div>

      <Button onClick={submitAssessment}>Submit Assessment</Button>

      {result && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Result</h2>
          <p className="mt-2 text-sm text-zinc-300">Score: <span className="font-semibold text-cyan-300">{result.score}</span></p>
          <p className="text-sm text-zinc-300">Estimated HSK Level: <span className="font-semibold text-emerald-300">{result.estimatedHskLevel}</span></p>
          <div className="mt-2 text-xs text-zinc-400">
            {Object.entries(result.sectionScores).map(([section, score]) => (
              <div key={section}>{section}: {score}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
