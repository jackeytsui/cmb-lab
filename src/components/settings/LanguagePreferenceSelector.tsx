"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import type { LanguagePreference } from "@/lib/interactions";
import { Loader2 } from "lucide-react";

interface LanguagePreferenceSelectorProps {
  /** Optional callback when preference changes */
  onChange?: (preference: LanguagePreference) => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Preference options with labels and descriptions.
 */
const PREFERENCE_OPTIONS: {
  value: LanguagePreference;
  label: string;
  description: string;
}[] = [
  {
    value: "both",
    label: "Both Languages",
    description: "Show Cantonese and Mandarin interactions",
  },
  {
    value: "cantonese",
    label: "Cantonese Only",
    description: "Focus on Cantonese interactions",
  },
  {
    value: "mandarin",
    label: "Mandarin Only",
    description: "Focus on Mandarin interactions",
  },
];

/**
 * Language preference selector component.
 *
 * Displays a dropdown for selecting language preference (Cantonese, Mandarin, or Both).
 * Automatically fetches current preference from API and persists changes.
 *
 * @example
 * ```tsx
 * <LanguagePreferenceSelector
 *   onChange={(pref) => console.log("Selected:", pref)}
 *   className="w-64"
 * />
 * ```
 */
export function LanguagePreferenceSelector({
  onChange,
  className,
}: LanguagePreferenceSelectorProps) {
  const { preference, isLoading, error, setPreference } =
    useLanguagePreference();

  const handleValueChange = async (value: string) => {
    const newPreference = value as LanguagePreference;
    await setPreference(newPreference);
    onChange?.(newPreference);
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`flex items-center gap-2 text-zinc-400 ${className || ""}`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading preferences...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select value={preference} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full sm:w-[250px]">
          <SelectValue placeholder="Select language preference" />
        </SelectTrigger>
        <SelectContent>
          {PREFERENCE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-zinc-400">
                  {option.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 mt-1">
          Failed to save preference. Please try again.
        </p>
      )}
    </div>
  );
}
