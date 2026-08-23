"use client";

import { useState } from "react";

export default function ProgressMigrationPage() {
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function run(apply: boolean) {
    setLoading(true);
    setResult(null);
    try {
      const parsed = JSON.parse(payload) as { records?: unknown[] } | unknown[];
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      const response = await fetch(
        "/api/admin/course-library/progress-migration",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply, records }),
        },
      );
      setResult(await response.json());
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Migration failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-amber-700">Admin migration tool</p>
        <h1 className="text-2xl font-semibold text-gray-950">
          GHL course progress migration
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Additive only: grants enrolled course access and completes lessons only
          inside chapters reported as 100% complete. Partial chapters are listed
          for review and are never guessed.
        </p>
      </div>

      <textarea
        aria-label="GHL progress payload"
        className="min-h-[320px] w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs"
        onChange={(event) => setPayload(event.target.value)}
        placeholder='{"records": [...]}'
        value={payload}
      />

      <div className="flex gap-3">
        <button
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading || !payload.trim()}
          onClick={() => run(false)}
          type="button"
        >
          Run dry check
        </button>
        <button
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading || !payload.trim()}
          onClick={() => run(true)}
          type="button"
        >
          Apply additive migration
        </button>
      </div>

      {result ? (
        <pre className="max-h-[520px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
