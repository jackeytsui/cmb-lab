"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  type: "placement" | "hsk_mock" | "custom";
  hskLevel: number | null;
};

export default function AssessmentsClient() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load assessments");
        return res.json();
      })
      .then((data) => setAssessments(data.assessments ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-zinc-400">Loading assessments...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {assessments.map((assessment) => (
          <Link
            key={assessment.id}
            href={`/dashboard/assessments/${assessment.id}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {assessment.type.replace("_", " ")} {assessment.hskLevel ? `• HSK ${assessment.hskLevel}` : ""}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-zinc-100">{assessment.title}</h2>
            {assessment.description && <p className="mt-1 text-sm text-zinc-400">{assessment.description}</p>}
          </Link>
        ))}
      </div>

      {assessments.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          No assessments published yet.
        </div>
      )}
    </>
  );
}
