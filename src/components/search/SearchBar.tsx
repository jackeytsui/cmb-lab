"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { SearchResults } from "./SearchResults";
import type { SearchResult } from "./SearchResults";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useDebouncedCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(term.trim())}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results);
      setSearchError(null);
      setIsOpen(data.results.length > 0);
    } catch {
      setSearchError("Search failed. Please try again.");
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  // Click outside to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder="Search"
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-48 lg:w-64"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
      </div>
      {isOpen && (
        searchError ? (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-50 p-3">
            <p className="text-sm text-red-400">{searchError}</p>
          </div>
        ) : (
          <SearchResults
            results={results}
            onSelect={() => {
              setIsOpen(false);
              setQuery("");
            }}
          />
        )
      )}
    </div>
  );
}
