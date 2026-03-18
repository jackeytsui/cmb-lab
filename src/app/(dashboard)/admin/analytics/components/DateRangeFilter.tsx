"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DateRangeFilterProps {
  onChange: (range: { from: string; to: string }) => void;
}

const PRESETS: { label: string; days: number | null }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All Time", days: null },
];

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activePreset, setActivePreset] = useState<number | null>(7);

  function applyPreset(days: number | null) {
    setActivePreset(days);
    if (days === null) {
      setFrom("");
      setTo("");
      onChange({ from: "", to: "" });
    } else {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - days);
      const f = fromDate.toISOString().slice(0, 10);
      const t = toDate.toISOString().slice(0, 10);
      setFrom(f);
      setTo(t);
      onChange({ from: f, to: t });
    }
  }

  function handleApply() {
    setActivePreset(null);
    onChange({ from, to });
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1.5 mr-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days)}
            className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
              activePreset === p.days
                ? "bg-primary text-primary-foreground"
                : "border border-input bg-background text-foreground hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <label
          htmlFor="date-from"
          className="mb-1 block text-sm text-muted-foreground"
        >
          From
        </label>
        <Input
          id="date-from"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setActivePreset(null);
          }}
          className="h-9 w-[180px]"
        />
      </div>
      <div>
        <label htmlFor="date-to" className="mb-1 block text-sm text-muted-foreground">
          To
        </label>
        <Input
          id="date-to"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setActivePreset(null);
          }}
          className="h-9 w-[180px]"
        />
      </div>
      <Button onClick={handleApply} className="h-9">
        Apply
      </Button>
    </div>
  );
}
