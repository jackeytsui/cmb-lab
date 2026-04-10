"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Tag as TagIcon,
  UserPlus,
  Trash2,
  Check,
} from "lucide-react";

type RoleValue = "student" | "coach" | "admin";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: RoleValue;
  createdAt: Date | string;
  portalAccessStatus: "active" | "paused" | "expired";
  assignedCoachId?: string | null;
  assignedCoachName?: string | null;
  tagIds: string[];
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface CoachOption {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  coaches: CoachOption[];
  allTags: TagOption[];
  usersRoleFilter: string;
  showAssignedCoachColumn: boolean;
  baseQueryString: string;
}

type BulkAction = "assign_coach" | "add_tags" | "remove_tags" | "delete" | null;

export function UsersManageTable({
  items,
  total,
  page,
  pageSize,
  coaches,
  allTags,
  usersRoleFilter,
  showAssignedCoachColumn,
  baseQueryString,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<BulkAction>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<string>("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const tagById = useMemo(
    () => new Map(allTags.map((t) => [t.id, t])),
    [allTags],
  );

  const allPageSelected =
    items.length > 0 && items.every((u) => selectedIds.has(u.id));
  const somePageSelected =
    items.some((u) => selectedIds.has(u.id)) && !allPageSelected;

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const u of items) next.delete(u.id);
      } else {
        for (const u of items) next.add(u.id);
      }
      return next;
    });
  }, [items, allPageSelected]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setActiveAction(null);
    setResultMessage(null);
  }, []);

  const openAction = useCallback((action: BulkAction) => {
    setActiveAction(action);
    setSelectedCoachId("");
    setSelectedTagIds(new Set());
    setResultMessage(null);
  }, []);

  const closeAction = useCallback(() => {
    setActiveAction(null);
    setSelectedCoachId("");
    setSelectedTagIds(new Set());
  }, []);

  const refreshPage = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const submitAssignCoach = async () => {
    setSubmitting(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/admin/students/bulk-assign-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          coachId: selectedCoachId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMessage(data.error || "Failed to assign coach");
        return;
      }
      setResultMessage(`✓ Updated ${data.updatedCount} user(s)`);
      closeAction();
      clearSelection();
      refreshPage();
    } finally {
      setSubmitting(false);
    }
  };

  const submitTagOp = async (operation: "add_tag" | "remove_tag") => {
    if (selectedTagIds.size === 0) {
      setResultMessage("Select at least one tag");
      return;
    }
    setSubmitting(true);
    setResultMessage(null);
    try {
      // The bulk endpoint handles one tag at a time; loop over selected tags.
      let totalSucceeded = 0;
      for (const tagId of selectedTagIds) {
        const res = await fetch("/api/admin/students/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation,
            studentIds: Array.from(selectedIds),
            targetId: tagId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          totalSucceeded += data.summary?.succeeded ?? 0;
        }
      }
      setResultMessage(
        `✓ ${operation === "add_tag" ? "Added" : "Removed"} ${totalSucceeded} tag assignment(s)`,
      );
      closeAction();
      clearSelection();
      refreshPage();
    } finally {
      setSubmitting(false);
    }
  };

  const submitDelete = async () => {
    if (
      !confirm(
        `Remove ${selectedIds.size} user(s) from the lab? This will revoke their access.`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/admin/students/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMessage(data.error || "Failed to delete users");
        return;
      }
      const msg = [
        `✓ Deleted ${data.deletedCount} user(s)`,
        data.selfExcluded > 0
          ? `(self-delete of ${data.selfExcluded} skipped)`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
      setResultMessage(msg);
      closeAction();
      clearSelection();
      refreshPage();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const showing =
    total === 0
      ? "0 of 0"
      : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`;

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openAction("assign_coach")}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Assign coach
              </button>
              <button
                type="button"
                onClick={() => openAction("add_tags")}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <TagIcon className="w-3.5 h-3.5" />
                Add tags
              </button>
              <button
                type="button"
                onClick={() => openAction("remove_tags")}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <TagIcon className="w-3.5 h-3.5" />
                Remove tags
              </button>
              <button
                type="button"
                onClick={() => openAction("delete")}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove from lab
              </button>
            </div>
          </div>

          {/* Action form */}
          {activeAction === "assign_coach" && (
            <div className="rounded border border-border bg-background p-3 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Assign coach to {selectedIds.size} user(s)
              </label>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                disabled={submitting}
              >
                <option value="">Unassigned</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name || coach.email}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAction}
                  disabled={submitting}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitAssignCoach}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Apply
                </button>
              </div>
            </div>
          )}

          {(activeAction === "add_tags" || activeAction === "remove_tags") && (
            <div className="rounded border border-border bg-background p-3 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {activeAction === "add_tags" ? "Add" : "Remove"} tags
                for {selectedIds.size} user(s) — click tags to select
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {allTags.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No tags available. Create tags in Tag Access first.
                  </span>
                ) : (
                  allTags.map((tag) => {
                    const selected = selectedTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTagSelection(tag.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAction}
                  disabled={submitting}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    submitTagOp(
                      activeAction === "add_tags" ? "add_tag" : "remove_tag",
                    )
                  }
                  disabled={submitting || selectedTagIds.size === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Apply
                </button>
              </div>
            </div>
          )}

          {activeAction === "delete" && (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-3 space-y-2">
              <p className="text-xs text-foreground">
                Remove <strong>{selectedIds.size}</strong> user(s) from the
                lab? This soft-deletes them and revokes access. Your own
                account will be excluded if selected.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAction}
                  disabled={submitting}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitDelete}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirm delete
                </button>
              </div>
            </div>
          )}

          {resultMessage && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {resultMessage}
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={togglePage}
                    className="rounded"
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Role
                </th>
                {showAssignedCoachColumn && (
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Coach
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tags
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Portal
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={showAssignedCoachColumn ? 8 : 7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((user) => {
                  const isSelected = selectedIds.has(user.id);
                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-b border-border/60 transition-colors",
                        isSelected
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(user.id)}
                          className="rounded"
                          aria-label={`Select ${user.name || user.email}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="hover:text-primary"
                        >
                          {user.name || user.email.split("@")[0]}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="capitalize text-foreground">
                          {user.role}
                        </span>
                      </td>
                      {showAssignedCoachColumn && (
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {user.role === "student"
                            ? user.assignedCoachName || "—"
                            : "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {user.tagIds.length === 0 ? (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          ) : (
                            user.tagIds.slice(0, 3).map((tagId) => {
                              const tag = tagById.get(tagId);
                              if (!tag) return null;
                              return (
                                <span
                                  key={tagId}
                                  className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    borderColor: `${tag.color}40`,
                                    backgroundColor: `${tag.color}15`,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              );
                            })
                          )}
                          {user.tagIds.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{user.tagIds.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            user.portalAccessStatus === "active"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : user.portalAccessStatus === "paused"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                                : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                          )}
                        >
                          {user.portalAccessStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {showing} users · {usersRoleFilter}
          {isPending && " · refreshing..."}
        </p>
        {total > pageSize && (
          <div className="flex items-center gap-2">
            <Link
              href={`${baseQueryString}&page=${page - 1}`}
              className={cn(
                "rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors",
                page <= 1
                  ? "pointer-events-none opacity-40"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
            <span className="text-xs text-muted-foreground">
              Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <Link
              href={`${baseQueryString}&page=${page + 1}`}
              className={cn(
                "rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors",
                page * pageSize >= total
                  ? "pointer-events-none opacity-40"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
              aria-disabled={page * pageSize >= total}
            >
              Next
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
