"use client";

import { useState, useCallback, useEffect } from "react";
import type { LanguagePreference } from "@/lib/interactions";

interface UseLanguagePreferenceOptions {
  /** Initial value before API fetch completes */
  initialValue?: LanguagePreference;
}

interface UseLanguagePreferenceReturn {
  /** Current language preference */
  preference: LanguagePreference;
  /** Whether the preference is loading from API */
  isLoading: boolean;
  /** Error message if fetch/update failed */
  error: string | null;
  /** Update the preference (calls API) */
  setPreference: (preference: LanguagePreference) => Promise<void>;
  /** Refetch preference from API */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing user language preference.
 *
 * Fetches preference from /api/user/preferences on mount.
 * Updates preference via PATCH with optimistic updates and rollback on error.
 *
 * @param options - Configuration options
 * @returns Language preference state and update functions
 *
 * @example
 * ```tsx
 * const { preference, isLoading, setPreference } = useLanguagePreference();
 *
 * if (isLoading) return <Spinner />;
 *
 * return (
 *   <Select value={preference} onValueChange={setPreference}>
 *     <SelectItem value="both">Both Languages</SelectItem>
 *     <SelectItem value="cantonese">Cantonese Only</SelectItem>
 *     <SelectItem value="mandarin">Mandarin Only</SelectItem>
 *   </Select>
 * );
 * ```
 */
export function useLanguagePreference(
  options: UseLanguagePreferenceOptions = {}
): UseLanguagePreferenceReturn {
  const { initialValue = "both" } = options;

  const [preference, setPreferenceState] =
    useState<LanguagePreference>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch preference from API on mount
  const fetchPreference = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/user/preferences");
      if (!response.ok) {
        throw new Error("Failed to fetch preferences");
      }

      const data = await response.json();
      setPreferenceState(data.languagePreference);
    } catch (err) {
      console.error("Error fetching language preference:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      // Keep the initial/current value on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update preference via API with optimistic update
  const setPreference = useCallback(
    async (newPreference: LanguagePreference) => {
      setError(null);

      // Optimistic update - save previous value for rollback
      const previousValue = preference;
      setPreferenceState(newPreference);

      try {
        const response = await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ languagePreference: newPreference }),
        });

        if (!response.ok) {
          throw new Error("Failed to update preference");
        }

        const data = await response.json();
        setPreferenceState(data.languagePreference);
      } catch (err) {
        console.error("Error updating language preference:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // Rollback on error
        setPreferenceState(previousValue);
      }
    },
    [preference]
  );

  // Fetch on mount
  useEffect(() => {
    fetchPreference();
  }, [fetchPreference]);

  return {
    preference,
    isLoading,
    error,
    setPreference,
    refresh: fetchPreference,
  };
}
