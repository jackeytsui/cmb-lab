"use client";

import { useEffect, useState } from "react";

export type AdminStudentSearchResult = {
  id: string;
  name: string;
  email: string;
};

const SEARCH_DELAY_MS = 250;

/** Search the complete student directory instead of filtering a preloaded page. */
export function useAdminStudentSearch(query: string, limit = 10) {
  const [results, setResults] = useState<AdminStudentSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = query.trim();
    if (!search) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          search,
          pageSize: String(Math.min(Math.max(limit, 1), 100)),
          sortBy: "email",
          sortOrder: "asc",
        });
        const response = await fetch(`/api/admin/students?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Could not search students");
        }

        setResults(
          (data?.students ?? []).map(
            (student: {
              id: string;
              name?: string | null;
              email?: string | null;
            }) => ({
              id: student.id,
              name: student.name || student.email || "Unknown student",
              email: student.email || "",
            }),
          ),
        );
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }
        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not search students",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [limit, query]);

  return { results, isLoading, error };
}
