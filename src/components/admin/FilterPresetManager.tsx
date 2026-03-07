"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bookmark,
  ChevronDown,
  Star,
  Trash2,
  Loader2,
} from "lucide-react";

interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
}

interface FilterPresetManagerProps {
  currentFilters: Record<string, string>;
  onPresetLoad: (filters: Record<string, string>) => void;
}

/**
 * FilterPresetManager - Save/load/delete filter presets.
 * Shows a dropdown with saved presets and a form to save the current filters.
 */
export function FilterPresetManager({
  currentFilters,
  onPresetLoad,
}: FilterPresetManagerProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch presets on mount
  useEffect(() => {
    fetchPresets();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowSaveForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchPresets() {
    try {
      const res = await fetch("/api/admin/students/filter-presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    }
  }

  async function handleSave() {
    if (!presetName.trim()) return;
    setIsSaving(true);

    try {
      // Convert current URL params to preset filters object
      const filters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(currentFilters)) {
        if (
          value &&
          key !== "page" &&
          key !== "pageSize"
        ) {
          if (key === "tagIds") {
            filters.tagIds = value.split(",").filter(Boolean);
          } else if (key === "atRisk") {
            filters.atRisk = value === "true";
          } else {
            filters[key] = value;
          }
        }
      }

      const res = await fetch("/api/admin/students/filter-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName.trim(),
          filters,
          isDefault,
        }),
      });

      if (res.ok) {
        setPresetName("");
        setIsDefault(false);
        setShowSaveForm(false);
        await fetchPresets();
      }
    } catch (error) {
      console.error("Failed to save preset:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(presetId: string) {
    setDeletingId(presetId);
    try {
      const res = await fetch(
        `/api/admin/students/filter-presets/${presetId}`,
        { method: "DELETE" },
      );
      if (res.ok || res.status === 204) {
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
      }
    } catch (error) {
      console.error("Failed to delete preset:", error);
    } finally {
      setDeletingId(null);
    }
  }

  function handleLoad(preset: FilterPreset) {
    const filters = preset.filters as Record<string, unknown>;
    const urlParams: Record<string, string> = {};

    if (filters.search) urlParams.search = String(filters.search);
    if (Array.isArray(filters.tagIds) && filters.tagIds.length > 0) {
      urlParams.tagIds = filters.tagIds.join(",");
    }
    if (filters.courseId) urlParams.courseId = String(filters.courseId);
    if (filters.atRisk) urlParams.atRisk = "true";
    if (filters.sortBy) urlParams.sortBy = String(filters.sortBy);
    if (filters.sortOrder) urlParams.sortOrder = String(filters.sortOrder);

    onPresetLoad(urlParams);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowSaveForm(false);
        }}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bookmark className="w-4 h-4" />
        <span>Presets</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          {/* Saved presets list */}
          <div className="max-h-60 overflow-y-auto">
            {presets.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No saved presets yet
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-accent"
                >
                  {preset.isDefault && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500 dark:fill-amber-300 dark:text-amber-300" />
                  )}
                  <button
                    onClick={() => handleLoad(preset)}
                    className="flex-1 truncate text-left text-sm text-foreground"
                    title={preset.name}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => handleDelete(preset.id)}
                    disabled={deletingId === preset.id}
                    className="p-1 text-muted-foreground opacity-0 transition-all hover:text-red-500 group-hover:opacity-100 dark:hover:text-red-300"
                    title="Delete preset"
                  >
                    {deletingId === preset.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Save form toggle */}
          {!showSaveForm ? (
            <button
              onClick={() => setShowSaveForm(true)}
              className="w-full px-4 py-2.5 text-left text-sm text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              + Save current filters
            </button>
          ) : (
            <div className="p-3 space-y-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-border bg-background accent-primary"
                  />
                  Set as default
                </label>
                <button
                  onClick={handleSave}
                  disabled={!presetName.trim() || isSaving}
                  className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
