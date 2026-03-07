"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, Plus } from "lucide-react";
import { TagBadge } from "./TagBadge";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface AutoTagRule {
  id: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  conditionType: string;
  conditionValue: string;
  isActive: boolean;
}

const CONDITION_LABELS: Record<string, (value: string) => string> = {
  inactive_days: (v) => `No login for ${v}+ days`,
  no_progress_days: (v) => `No progress for ${v}+ days`,
  course_completed: (v) => `Completed course: ${v}`,
};

const CONDITION_TYPES = [
  { value: "inactive_days", label: "Inactive for X days" },
  { value: "no_progress_days", label: "No progress for X days" },
  { value: "course_completed", label: "Completed course" },
];

/**
 * AutoTagRuleEditor - Table/list component for managing auto-tag rules.
 *
 * Features:
 * - Fetches and displays all auto-tag rules
 * - Toggle active/inactive per rule
 * - Delete rules
 * - Add new rule form with tag selection, condition type, and threshold
 */
export function AutoTagRuleEditor() {
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // New rule form state
  const [newTagId, setNewTagId] = useState("");
  const [newConditionType, setNewConditionType] = useState("inactive_days");
  const [newConditionValue, setNewConditionValue] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auto-tag-rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error("Failed to fetch auto-tag rules:", error);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tags");
      if (res.ok) {
        const data = await res.json();
        setAllTags(data.tags || []);
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchTags()]).then(() => setLoading(false));
  }, [fetchRules, fetchTags]);

  const handleToggle = async (ruleId: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/auto-tag-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, isActive: !isActive }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === ruleId ? { ...r, isActive: !isActive } : r
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      const res = await fetch("/api/admin/auto-tag-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
    } catch (error) {
      console.error("Failed to delete rule:", error);
    }
  };

  const handleCreate = async () => {
    if (!newTagId || !newConditionValue.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/auto-tag-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: newTagId,
          conditionType: newConditionType,
          conditionValue: newConditionValue.trim(),
        }),
      });
      if (res.ok) {
        setNewTagId("");
        setNewConditionValue("");
        setShowAdd(false);
        await fetchRules();
      }
    } catch (error) {
      console.error("Failed to create rule:", error);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading auto-tag rules...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Rules list */}
      {rules.length === 0 && !showAdd ? (
        <p className="text-sm text-zinc-500 py-4">
          No auto-tag rules configured. Rules automatically apply tags based on student activity.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {rules.map((rule) => {
            const conditionLabel =
              CONDITION_LABELS[rule.conditionType]?.(rule.conditionValue) ??
              `${rule.conditionType}: ${rule.conditionValue}`;

            return (
              <div
                key={rule.id}
                className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <TagBadge
                    name={rule.tagName}
                    color={rule.tagColor}
                    type="system"
                  />
                  <span className="text-sm text-zinc-300">{conditionLabel}</span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggle(rule.id, rule.isActive)}
                    className={`
                      relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                      ${rule.isActive ? "bg-cyan-600" : "bg-zinc-600"}
                    `}
                    aria-label={rule.isActive ? "Disable rule" : "Enable rule"}
                  >
                    <span
                      className={`
                        inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                        ${rule.isActive ? "translate-x-4.5" : "translate-x-0.5"}
                      `}
                    />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add rule form */}
      {showAdd ? (
        <div className="border border-zinc-700 rounded-lg p-4 space-y-3 bg-zinc-800/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Tag selector */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Tag</label>
              <select
                value={newTagId}
                onChange={(e) => setNewTagId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="">Select a tag...</option>
                {allTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Condition type */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Condition
              </label>
              <select
                value={newConditionType}
                onChange={(e) => setNewConditionType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {CONDITION_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold value */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                {newConditionType === "course_completed"
                  ? "Course name"
                  : "Days threshold"}
              </label>
              <input
                type={
                  newConditionType === "course_completed" ? "text" : "number"
                }
                value={newConditionValue}
                onChange={(e) => setNewConditionValue(e.target.value)}
                placeholder={
                  newConditionType === "course_completed"
                    ? "Course name..."
                    : "e.g. 7"
                }
                min={newConditionType !== "course_completed" ? 1 : undefined}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newTagId || !newConditionValue.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              {creating ? "Creating..." : "Create Rule"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-sm text-zinc-400 hover:text-white px-3 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      )}
    </div>
  );
}
