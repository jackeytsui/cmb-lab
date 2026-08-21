"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReconcileSourceClient() {
  const [records, setRecords] = useState("");
  const [running, setRunning] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const run = async (apply: boolean) => {
    setRunning(apply ? "apply" : "preview");
    setResult(null);
    try {
      const parsed = JSON.parse(records);
      const response = await fetch("/api/admin/students/reconcile-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: parsed, apply }),
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Invalid input" });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        aria-label="Source records JSON"
        value={records}
        onChange={(event) => setRecords(event.target.value)}
        className="min-h-64 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
        placeholder='[{"firstName":"...","lastName":"...","email":"...","coachName":"...","courseEndDate":"..."}]'
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!records || running !== null}
          onClick={() => run(false)}
        >
          {running === "preview" ? "Previewing…" : "Preview changes"}
        </Button>
        <Button
          type="button"
          disabled={!records || running !== null}
          onClick={() => run(true)}
        >
          {running === "apply" ? "Applying…" : "Apply exact-email matches"}
        </Button>
      </div>
      {result ? (
        <pre className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-card p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
