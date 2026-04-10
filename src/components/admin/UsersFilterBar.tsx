"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Filter, X, Search, Check, Tag as TagIcon, Loader2 } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();
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

  // Search state — local because it submits on Enter
  const [searchDraft, setSearchDraft] = useState(initialSearch);

  // Tag search input inside the picker (pure UI, no URL effect)
  const [tagSearch, setTagSearch] = useState("");

  // Currently applied filter values (derived from URL initial props)
  const applied = {
    search: initialSearch,
    coachId: initialCoachId,
    createdFrom: initialCreatedFrom,
    createdTo: initialCreatedTo,
    tagIds: initialTagIds,
    portalAccess: initialPortalAccess,
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.coachId) n++;
    if (applied.createdFrom) n++;
    if (applied.createdTo) n++;
    if (applied.tagIds.length > 0) n++;
    if (applied.portalAccess) n++;
    return n;
  }, [applied.coachId, applied.createdFrom, applied.createdTo, applied.tagIds, applied.portalAccess]);

  // Build the URL with given overrides (merges with currently applied filters)
  const buildUrl = useCallback(
    (overrides: Partial<typeof applied>) => {
      const merged = { ...applied, ...overrides };
      const params = new URLSearchParams();
      params.set("tab", "users");
      params.set("usersRole", roleFilter);
      if (merged.search) params.set("search", merged.search);
      if (merged.coachId) params.set("coachId", merged.coachId);
      if (merged.createdFrom) params.set("createdFrom", merged.createdFrom);
      if (merged.createdTo) params.set("createdTo", merged.createdTo);
      if (merged.tagIds.length > 0) params.set("tagIds", merged.tagIds.join(","));
      if (merged.portalAccess) params.set("portalAccess", merged.portalAccess);
      return `?${params.toString()}`;
    },
    [applied, roleFilter],
  );

  const navigate = useCallback(
    (overrides: Partial<typeof applied>) => {
      startTransition(() => {
        router.push(buildUrl(overrides));
      });
    },
    [router, buildUrl],
  );

  const clearAll = useCallback(() => {
    startTransition(() => {
      router.push(
        `?tab=users&usersRole=${roleFilter}${
          applied.search ? `&search=${encodeURIComponent(applied.search)}` : ""
        }`,
      );
    });
  }, [router, roleFilter, applied.search]);

  const toggleTagId = (id: string) => {
    const next = applied.tagIds.includes(id)
      ? applied.tagIds.filter((t) => t !== id)
      : [...applied.tagIds, id];
    navigate({ tagIds: next });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ search: searchDraft });
  };

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, tagSearch]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search name or email (press Enter)"
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
        {isPending && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
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
                value={applied.coachId}
                onChange={(e) => navigate({ coachId: e.target.value })}
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
                value={applied.portalAccess}
                onChange={(e) => navigate({ portalAccess: e.target.value })}
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
                  value={applied.createdFrom}
                  onChange={(e) => navigate({ createdFrom: e.target.value })}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs"
                  placeholder="From"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={applied.createdTo}
                  onChange={(e) => navigate({ createdTo: e.target.value })}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs"
                  placeholder="To"
                />
              </div>
            </div>
          </div>

          {/* Tags filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Has Tags{" "}
              {applied.tagIds.length > 0 &&
                `(${applied.tagIds.length} selected — ALL required)`}
            </label>
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No tags exist yet.
              </p>
            ) : (
              <>
                {/* Search input */}
                <div className="relative mb-2">
                  <TagIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder={`Search ${allTags.length} tag${allTags.length === 1 ? "" : "s"}...`}
                    className="w-full rounded-md border border-border bg-background pl-8 pr-8 py-1.5 text-xs"
                  />
                  {tagSearch && (
                    <button
                      type="button"
                      onClick={() => setTagSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtered list */}
                {filteredTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No tags match &ldquo;{tagSearch}&rdquo;
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-0.5">
                    {filteredTags.map((tag) => {
                      const selected = applied.tagIds.includes(tag.id);
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

                {tagSearch && applied.tagIds.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {applied.tagIds.length} tag
                    {applied.tagIds.length === 1 ? "" : "s"} selected
                    (including ones not shown)
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
