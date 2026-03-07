"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DateRangeFilterProps {
  onChange: (range: { from: string; to: string }) => void;
}

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  function handleApply() {
    onChange({ from, to });
  }

  function handleClear() {
    setFrom("");
    setTo("");
    onChange({ from: "", to: "" });
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
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
          onChange={(e) => setFrom(e.target.value)}
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
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-[180px]"
        />
      </div>
      <Button onClick={handleApply} className="h-9">
        Apply
      </Button>
      <Button onClick={handleClear} variant="outline" className="h-9">
        Clear
      </Button>
    </div>
  );
}
