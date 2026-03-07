"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Filters {
  studentName: string;
  practiceSetId: string;
  dateFrom: string;
  dateTo: string;
  scoreMin: string;
  scoreMax: string;
}

export const DEFAULT_FILTERS: Filters = {
  studentName: "",
  practiceSetId: "all",
  dateFrom: "",
  dateTo: "",
  scoreMin: "",
  scoreMax: "",
};

interface PracticeFiltersProps {
  practiceSets: { id: string; title: string }[];
  filters: Filters;
  onApply: (filters: Filters) => void;
  onClear: () => void;
}

const inputClasses =
  "h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500";

export function PracticeFilters({
  practiceSets,
  filters,
  onApply,
  onClear,
}: PracticeFiltersProps) {
  const [local, setLocal] = useState<Filters>(filters);

  function update(field: keyof Filters, value: string) {
    setLocal((prev) => ({ ...prev, [field]: value }));
  }

  function handleApply() {
    onApply(local);
  }

  function handleClear() {
    setLocal(DEFAULT_FILTERS);
    onClear();
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      {/* Student search */}
      <div>
        <label
          htmlFor="filter-student"
          className="mb-1 block text-sm text-zinc-400"
        >
          Student
        </label>
        <input
          id="filter-student"
          type="text"
          value={local.studentName}
          onChange={(e) => update("studentName", e.target.value)}
          placeholder="Search by name or email..."
          className={`${inputClasses} w-48`}
        />
      </div>

      {/* Practice set selector */}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">
          Practice Set
        </label>
        <Select
          value={local.practiceSetId}
          onValueChange={(value) => update("practiceSetId", value)}
        >
          <SelectTrigger className="h-9 w-40 border-zinc-700 bg-zinc-800 text-sm text-white">
            <SelectValue placeholder="All sets" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-800">
            <SelectItem value="all">All sets</SelectItem>
            {practiceSets.map((set) => (
              <SelectItem key={set.id} value={set.id}>
                {set.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date From */}
      <div>
        <label
          htmlFor="filter-date-from"
          className="mb-1 block text-sm text-zinc-400"
        >
          From
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={local.dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          className={inputClasses}
        />
      </div>

      {/* Date To */}
      <div>
        <label
          htmlFor="filter-date-to"
          className="mb-1 block text-sm text-zinc-400"
        >
          To
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={local.dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          className={inputClasses}
        />
      </div>

      {/* Min Score */}
      <div>
        <label
          htmlFor="filter-score-min"
          className="mb-1 block text-sm text-zinc-400"
        >
          Min Score
        </label>
        <input
          id="filter-score-min"
          type="number"
          min="0"
          max="100"
          value={local.scoreMin}
          onChange={(e) => update("scoreMin", e.target.value)}
          className={`${inputClasses} w-20`}
        />
      </div>

      {/* Max Score */}
      <div>
        <label
          htmlFor="filter-score-max"
          className="mb-1 block text-sm text-zinc-400"
        >
          Max Score
        </label>
        <input
          id="filter-score-max"
          type="number"
          min="0"
          max="100"
          value={local.scoreMax}
          onChange={(e) => update("scoreMax", e.target.value)}
          className={`${inputClasses} w-20`}
        />
      </div>

      {/* Apply button */}
      <button
        onClick={handleApply}
        className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
      >
        Apply
      </button>

      {/* Clear button */}
      <button
        onClick={handleClear}
        className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
