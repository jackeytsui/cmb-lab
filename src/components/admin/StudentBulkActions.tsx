"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookPlus,
  BookMinus,
  Tag,
  TagsIcon,
  ShieldPlus,
  ShieldMinus,
  UserCheck,
  X,
  Loader2,
  Search,
} from "lucide-react";
import { BulkResultsDialog } from "./BulkResultsDialog";

type BulkOperation = "assign_course" | "remove_course" | "add_tag" | "remove_tag" | "assign_role" | "remove_role" | "assign_coach";

interface StudentBulkActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onOperationComplete: () => void;
}

interface PickerItem {
  id: string;
  label: string;
  color?: string;
  subtitle?: string;
}

interface BulkApiResponse {
  operationId: string;
  results: { studentId: string; success: boolean; error?: string }[];
  summary: { total: number; succeeded: number; failed: number };
}

const ACTION_BUTTONS: {
  operation: BulkOperation;
  label: string;
  icon: React.ElementType;
  pickerTitle: string;
  fetchEndpoint: string;
}[] = [
  {
    operation: "assign_course",
    label: "Assign Course",
    icon: BookPlus,
    pickerTitle: "Select course to assign",
    fetchEndpoint: "/api/admin/courses",
  },
  {
    operation: "remove_course",
    label: "Remove Course",
    icon: BookMinus,
    pickerTitle: "Select course to remove",
    fetchEndpoint: "/api/admin/courses",
  },
  {
    operation: "add_tag",
    label: "Add Tag",
    icon: Tag,
    pickerTitle: "Select tag to add",
    fetchEndpoint: "/api/admin/tags",
  },
  {
    operation: "remove_tag",
    label: "Remove Tag",
    icon: TagsIcon,
    pickerTitle: "Select tag to remove",
    fetchEndpoint: "/api/admin/tags",
  },
  {
    operation: "assign_coach",
    label: "Assign Coach",
    icon: UserCheck,
    pickerTitle: "Select coach to assign",
    fetchEndpoint: "/api/admin/coaches",
  },
  {
    operation: "assign_role",
    label: "Assign Role",
    icon: ShieldPlus,
    pickerTitle: "Select role to assign",
    fetchEndpoint: "/api/admin/roles",
  },
  {
    operation: "remove_role",
    label: "Remove Role",
    icon: ShieldMinus,
    pickerTitle: "Select role to remove",
    fetchEndpoint: "/api/admin/roles",
  },
];

export function StudentBulkActions({
  selectedIds,
  onClearSelection,
  onOperationComplete,
}: StudentBulkActionsProps) {
  // Picker dialog state
  const [activeOperation, setActiveOperation] = useState<BulkOperation | null>(null);
  const [pickerItems, setPickerItems] = useState<PickerItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Operation execution state
  const [executing, setExecuting] = useState(false);
  // Expiration date for role assignment
  const [roleExpiresAt, setRoleExpiresAt] = useState("");

  // Results dialog state
  const [resultsData, setResultsData] = useState<{
    operationId: string;
    operationType: string;
    results: BulkApiResponse["results"];
    summary: BulkApiResponse["summary"];
    expiresAt: number;
  } | null>(null);

  const activeBtnConfig = ACTION_BUTTONS.find((b) => b.operation === activeOperation);

  // Fetch picker items when dialog opens
  useEffect(() => {
    if (!activeOperation || !activeBtnConfig) return;

    let cancelled = false;
    setPickerLoading(true);
    setPickerItems([]);
    setPickerSearch("");
    setSelectedTargetId(null);

    fetch(activeBtnConfig.fetchEndpoint)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;

        // Normalize response shape
        if (data.coaches) {
          setPickerItems(
            data.coaches.map((c: { id: string; name: string | null; email: string }) => ({
              id: c.id,
              label: c.name || c.email,
              subtitle: c.email,
            }))
          );
        } else if (data.courses) {
          setPickerItems(
            data.courses.map((c: { id: string; title: string; description?: string }) => ({
              id: c.id,
              label: c.title,
              subtitle: c.description || undefined,
            }))
          );
        } else if (data.tags) {
          setPickerItems(
            data.tags.map((t: { id: string; name: string; color: string }) => ({
              id: t.id,
              label: t.name,
              color: t.color,
            }))
          );
        } else if (data.roles) {
          setPickerItems(
            data.roles.map((r: { id: string; name: string; color: string; description?: string }) => ({
              id: r.id,
              label: r.name,
              color: r.color,
              subtitle: r.description || undefined,
            }))
          );
        }
        setPickerLoading(false);
      })
      .catch(() => {
        if (!cancelled) setPickerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOperation, activeBtnConfig]);

  const filteredItems = pickerItems.filter((item) =>
    item.label.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const handleConfirm = useCallback(async () => {
    if (!activeOperation || !selectedTargetId) return;

    setExecuting(true);
    try {
      // Assign coach uses per-student PATCH endpoint
      if (activeOperation === "assign_coach") {
        const results: BulkApiResponse["results"] = [];
        for (const studentId of selectedIds) {
          try {
            const res = await fetch(`/api/admin/students/${studentId}/coach`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coachId: selectedTargetId }),
            });
            if (res.ok) {
              results.push({ studentId, success: true });
            } else {
              const data = await res.json().catch(() => ({}));
              results.push({ studentId, success: false, error: data.error || "Failed" });
            }
          } catch {
            results.push({ studentId, success: false, error: "Network error" });
          }
        }
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        setActiveOperation(null);
        setResultsData({
          operationId: "assign_coach_bulk",
          operationType: activeOperation,
          results,
          summary: { total: selectedIds.length, succeeded, failed },
          expiresAt: 0,
        });
        setExecuting(false);
        onOperationComplete();
        return;
      }

      const res = await fetch("/api/admin/students/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: activeOperation,
          studentIds: selectedIds,
          targetId: selectedTargetId,
          ...(activeOperation === "assign_role" && roleExpiresAt
            ? { expiresAt: new Date(roleExpiresAt + "T23:59:59.999Z").toISOString() }
            : {}),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Bulk operation failed");
      }

      const data: BulkApiResponse = await res.json();

      // Close picker, open results
      setActiveOperation(null);
      setResultsData({
        operationId: data.operationId,
        operationType: activeOperation,
        results: data.results,
        summary: data.summary,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now
      });
    } catch (err) {
      // Show error inline in picker -- keep it open
      console.error("Bulk operation error:", err);
      alert(err instanceof Error ? err.message : "Bulk operation failed");
    } finally {
      setExecuting(false);
    }
  }, [activeOperation, selectedTargetId, selectedIds, roleExpiresAt, onOperationComplete]);

  const closePicker = () => {
    setActiveOperation(null);
    setPickerItems([]);
    setPickerSearch("");
    setSelectedTargetId(null);
    setRoleExpiresAt("");
  };

  const closeResults = () => {
    setResultsData(null);
  };

  const handleUndoComplete = () => {
    setResultsData(null);
    onOperationComplete();
  };

  const isCoachOperation = activeOperation === "assign_coach";
  const isTagOperation =
    activeOperation === "add_tag" || activeOperation === "remove_tag";
  const isRoleOperation =
    activeOperation === "assign_role" || activeOperation === "remove_role";

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2">
        <span className="text-sm font-medium text-primary">
          {selectedIds.length} student{selectedIds.length !== 1 ? "s" : ""}{" "}
          selected
        </span>
        <button
          onClick={onClearSelection}
          className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
        >
          Clear selection
        </button>

        <div className="ml-auto flex items-center gap-2">
          {ACTION_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.operation}
                onClick={() => setActiveOperation(btn.operation)}
                disabled={executing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon className="w-3.5 h-3.5" />
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Picker Dialog */}
      {activeOperation && activeBtnConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closePicker}
          />
          <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
            {/* Picker header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {activeBtnConfig.pickerTitle}
              </h3>
              <button
                onClick={closePicker}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search input */}
            <div className="border-b border-border px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={`Search ${isCoachOperation ? "coaches" : isRoleOperation ? "roles" : isTagOperation ? "tags" : "courses"}...`}
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                  autoFocus
                />
              </div>
            </div>

            {/* Items list */}
            <div className="px-5 py-3 max-h-64 overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {pickerSearch
                    ? "No matching items found"
                    : `No ${isCoachOperation ? "coaches" : isRoleOperation ? "roles" : isTagOperation ? "tags" : "courses"} available`}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedTargetId(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        selectedTargetId === item.id
                          ? "bg-cyan-900/40 border border-cyan-700/50 text-white"
                          : "hover:bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {item.color && (
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{item.label}</div>
                        {item.subtitle && (
                          <div className="text-xs text-zinc-500 truncate">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {selectedTargetId === item.id && (
                        <span className="text-cyan-400 text-xs font-medium shrink-0">
                          Selected
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Optional expiration for assign_role */}
            {activeOperation === "assign_role" && (
              <div className="px-5 py-3 border-t border-zinc-800/50">
                <label className="text-xs text-zinc-400 mb-1.5 block">
                  Expiration date (optional)
                </label>
                <input
                  type="date"
                  value={roleExpiresAt}
                  onChange={(e) => setRoleExpiresAt(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none [color-scheme:dark]"
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
              <span className="text-xs text-zinc-500">
                Applies to {selectedIds.length} student
                {selectedIds.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={closePicker}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!selectedTargetId || executing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {executing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Dialog */}
      {resultsData && (
        <BulkResultsDialog
          open={true}
          onClose={closeResults}
          operationId={resultsData.operationId}
          operationType={resultsData.operationType}
          results={resultsData.results}
          summary={resultsData.summary}
          expiresAt={resultsData.expiresAt}
          onUndoComplete={handleUndoComplete}
        />
      )}
    </>
  );
}
