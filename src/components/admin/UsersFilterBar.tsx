"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Filter, X, Search, Check } from "lucide-react";

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
  coaches: CoachOption[];
  allTags: TagOption[];
  initialSearch: string;
  initialCoachId: string;
  initialCreatedFrom: string;
  initialCreatedTo: string;
  initialTagIds: string[];
  initialPortalAccess: string;
  roleFilter: string;
}

export function UsersFilterBar({
  coaches,
  allTags,
  initialSearch,
  initialCoachId,
  initialCreatedFrom,
  initialCreatedTo,
  initialTagIds,
  initialPortalAccess,
  roleFilter,
}: Props) {
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(() => {
    // Auto-open filters if any are active on mount
    return Boolean(
      initialCoachId ||
        initialCreatedFrom ||
        initialCreatedTo ||
        initialTagIds.length > 0 ||
        initialPortalAccess,
    );
  });
  const [search, setSearch] = useState(initialSearch);
  const [coachId, setCoachId] = useState(initialCoachId);
  const [createdFrom, setCreatedFrom] = useState(initialCreatedFrom);
  const [createdTo, setCreatedTo] = useState(initialCreatedTo);
  const [tagIds, setTagIds] = useState<Set<string>>(new Set(initialTagIds));
  const [portalAccess, setPortalAccess] = useState(initialPortalAccess);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (coachId) n++;
    if (createdFrom) n++;
    if (createdTo) n++;
    if (tagIds.size > 0) n++;
    if (portalAccess) n++;
    return n;
  }, [coachId, createdFrom, createdTo, tagIds, portalAccess]);

  const buildUrl = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      const params = new URLSearchParams();
      params.set("tab", "users");
      params.set("usersRole", roleFilter);
      if (overrides.search !== undefined ? overrides.search : search) {
        params.set("search", overrides.search ?? search);
      }
      if (overrides.coachId !== undefined ? overrides.coachId : coachId) {
        params.set("coachId", overrides.coachId ?? coachId);
      }
      if (
        overrides.createdFrom !== undefined ? overrides.createdFrom : createdFrom
      ) {
        params.set("createdFrom", overrides.createdFrom ?? createdFrom);
      }
      if (overrides.createdTo !== undefined ? overrides.createdTo : createdTo) {
        params.set("createdTo", overrides.createdTo ?? createdTo);
      }
      const tagIdsList =
        overrides.tagIds !== undefined
          ? overrides.tagIds
          : Array.from(tagIds).join(",");
      if (tagIdsList) params.set("tagIds", tagIdsList);
      if (
        overrides.portalAccess !== undefined ? overrides.portalAccess : portalAccess
      ) {
        params.set("portalAccess", overrides.portalAccess ?? portalAccess);
      }
      return `?${params.toString()}`;
    },
    [roleFilter, search, coachId, createdFrom, createdTo, tagIds, portalAccess],
  );

  const applyFilters = useCallback(() => {
    router.push(buildUrl());
  }, [router, buildUrl]);

  const clearAll = useCallback(() => {
    setCoachId("");
    setCreatedFrom("");
    setCreatedTo("");
    setTagIds(new Set());
    setPortalAccess("");
    router.push(
      `?tab=users&usersRole=${roleFilter}${search ? `&search=${search}` : ""}`,
    );
  }, [router, roleFilter, search]);

  const toggleTagId = (id: string) => {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(buildUrl());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm"
          />
        </form>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            activeFilterCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:bg-accent",
          )}
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Coach filter */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Assigned Coach
              </label>
              <select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="unassigned">Unassigned</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name || coach.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Portal access filter */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Portal Access
              </label>
              <select
                value={portalAccess}
                onChange={(e) => setPortalAccess(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            {/* Created date range */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Created Date
              </label>
              <div className="flex gap-1 items-center">
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(e) => setCreatedFrom(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs"
                  placeholder="From"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={createdTo}
                  onChange={(e) => setCreatedTo(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs"
                  placeholder="To"
                />
              </div>
            </div>
          </div>

          {/* Tags filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Has Tags {tagIds.size > 0 && `(${tagIds.size} selected — ALL required)`}
            </label>
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No tags exist yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {allTags.map((tag) => {
                  const selected = tagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTagId(tag.id)}
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
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
