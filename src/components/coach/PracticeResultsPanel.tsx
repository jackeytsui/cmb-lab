"use client";

import { useCallback, useEffect, useState } from "react";
import { PracticeFilters, DEFAULT_FILTERS } from "./PracticeFilters";
import { PracticeAttemptTable } from "./PracticeAttemptTable";
import { PracticeAggregateCards } from "./PracticeAggregateCards";
import { PracticeAggregateCharts } from "./PracticeAggregateCharts";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { Filters } from "./PracticeFilters";
import type { PracticeResultsResponse } from "@/lib/coach-practice";

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.studentName) params.set("student", filters.studentName);
  if (filters.practiceSetId && filters.practiceSetId !== "all") {
    params.set("setId", filters.practiceSetId);
  }
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.scoreMin) params.set("scoreMin", filters.scoreMin);
  if (filters.scoreMax) params.set("scoreMax", filters.scoreMax);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function PracticeResultsPanel() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PracticeResultsResponse | null>(null);

  const fetchData = useCallback(async (currentFilters: Filters) => {
    setLoading(true);
    setError(null);

    try {
      const qs = buildQueryString(currentFilters);
      const res = await fetch(`/api/coach/practice-results${qs}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(
          text || `Failed to load practice results (${res.status}). Please try again.`
        );
        return;
      }
      const json = (await res.json()) as PracticeResultsResponse;
      setData(json);
    } catch (err) {
      console.error("Error fetching practice results:", err);
      setError("Failed to load practice results. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters);
  }, [fetchData, filters]);

  function handleApply(newFilters: Filters) {
    setFilters(newFilters);
  }

  function handleClear() {
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <div className="space-y-8">
      {/* Filters */}
      <PracticeFilters
        practiceSets={data?.practiceSets ?? []}
        filters={filters}
        onApply={handleApply}
        onClear={handleClear}
      />

      {/* Error Banner */}
      {error && (
        <ErrorAlert message={error} onRetry={() => fetchData(filters)} />
      )}

      {/* Aggregate Stat Cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-300">Overview</h2>
        <PracticeAggregateCards
          totalAttempts={data?.aggregates.totalAttempts ?? 0}
          totalStudents={data?.aggregates.totalStudents ?? 0}
          overallAvgScore={data?.aggregates.overallAvgScore ?? 0}
          overallCompletionRate={data?.aggregates.overallCompletionRate ?? 0}
          loading={loading}
        />
      </section>

      {/* Aggregate Charts */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-300">Analytics</h2>
        <PracticeAggregateCharts
          perSet={data?.aggregates.perSet ?? []}
          hardestExercises={data?.aggregates.hardestExercises ?? []}
          loading={loading}
        />
      </section>

      {/* Attempt Details Table */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-300">
          Attempt Details
        </h2>
        <PracticeAttemptTable
          attempts={data?.attempts ?? []}
          loading={loading}
        />
      </section>
    </div>
  );
}
