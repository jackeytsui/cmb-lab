"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
  type Row,
} from "@tanstack/react-table";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  User,
  Settings2,
  Filter,
  X,
} from "lucide-react";
import { activeStudentColumns } from "./active-students-columns";
import { ActiveStudent } from "@/db/schema/active-students";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ActiveStudentDataTableProps {
  data: ActiveStudent[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search: string;
  filters: {
    tags?: string;
    assignedTo?: string;
    country?: string;
    productLine?: string;
  };
}

export function ActiveStudentDataTable({
  data,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
  search,
  filters,
}: ActiveStudentDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    // Default hidden columns to reduce clutter
    phone: false,
    source: false,
    updated: false,
    lastActivity: false,
  });
  
  const [searchInput, setSearchInput] = useState(search);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState(filters.tags || "");
  const [assignedFilter, setAssignedFilter] = useState(filters.assignedTo || "");
  const [countryFilter, setCountryFilter] = useState(filters.country || "");
  const [productFilter, setProductFilter] = useState(filters.productLine || "");
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Sync external props to local state when URL changes
  useEffect(() => {
    setSearchInput(search);
    setTagFilter(filters.tags || "");
    setAssignedFilter(filters.assignedTo || "");
    setCountryFilter(filters.country || "");
    setProductFilter(filters.productLine || "");
  }, [search, filters]);

  // URL sync helper
  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        updateSearchParams({
          search: value || null,
          page: "1",
        });
      }, 300);
    },
    [updateSearchParams],
  );

  // Debounced filter updates
  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      if (key === "tags") setTagFilter(value);
      if (key === "assignedTo") setAssignedFilter(value);
      if (key === "country") setCountryFilter(value);
      if (key === "productLine") setProductFilter(value);

      if (filterTimerRef.current) {
        clearTimeout(filterTimerRef.current);
      }
      filterTimerRef.current = setTimeout(() => {
        updateSearchParams({
            [key]: value || null,
            page: "1",
        });
      }, 500);
    },
    [updateSearchParams]
  );
  
  const clearFilters = () => {
      setTagFilter("");
      setAssignedFilter("");
      setCountryFilter("");
      setProductFilter("");
      updateSearchParams({
          tags: null,
          assignedTo: null,
          country: null,
          productLine: null,
          page: "1",
      });
  };


  // Cleanup timers
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, []);

  const pageCount = Math.ceil(total / pageSize);

  const table = useReactTable({
    data,
    columns: activeStudentColumns,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ id: sortBy, desc: sortOrder === "desc" }],
      rowSelection,
      columnVisibility,
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex: page - 1, pageSize })
          : updater;
      updateSearchParams({
        page: String(next.pageIndex + 1),
        pageSize: String(next.pageSize),
      });
    },
    onSortingChange: (updater) => {
      const current: SortingState = [
        { id: sortBy, desc: sortOrder === "desc" },
      ];
      const next =
        typeof updater === "function" ? updater(current) : updater;
      if (next.length > 0) {
        updateSearchParams({
          sortBy: next[0].id,
          sortOrder: next[0].desc ? "desc" : "asc",
          page: "1",
        });
      }
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.contactId,
  });

  const handleRowClick = (
    row: Row<ActiveStudent>,
    event: React.MouseEvent,
  ) => {
    if ((event.target as HTMLElement).closest('input[type="checkbox"]')) return;
    router.push(`/admin/users/ghl/${row.original.contactId}`);
  };

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  
  const activeFilterCount = [tagFilter, assignedFilter, countryFilter, productFilter].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Top Bar: Search, Column Toggle, Filter Toggle */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search active students..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        
        <div className="flex items-center gap-2">
           <Button
            variant="outline"
            size="sm"
            className={`border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground ${showFilters ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
           >
             <Filter className="w-4 h-4 mr-2" />
             Filters
             {activeFilterCount > 0 && (
                <span className="ml-1.5 min-w-[16px] rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
           </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px] border-border bg-popover text-popover-foreground">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Toggle Columns</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                {table
                  .getAllColumns()
                  .filter(
                    (column) =>
                      typeof column.accessorFn !== "undefined" && column.getCanHide()
                  )
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="cursor-pointer capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {column.id.replace(/([A-Z])/g, " $1").trim()} 
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 animate-in slide-in-from-top-2 duration-200 sm:grid-cols-2 md:grid-cols-4">
           <div className="space-y-1.5">
             <label className="text-xs font-medium uppercase text-muted-foreground">Tags</label>
             <input
               type="text"
               placeholder="Filter by tag..."
               value={tagFilter}
               onChange={(e) => handleFilterChange("tags", e.target.value)}
               className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
             />
           </div>
           <div className="space-y-1.5">
             <label className="text-xs font-medium uppercase text-muted-foreground">Assigned To</label>
             <input
               type="text"
               placeholder="Filter by user..."
               value={assignedFilter}
               onChange={(e) => handleFilterChange("assignedTo", e.target.value)}
               className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
             />
           </div>
            <div className="space-y-1.5">
             <label className="text-xs font-medium uppercase text-muted-foreground">Country</label>
             <input
               type="text"
               placeholder="Filter by country..."
               value={countryFilter}
               onChange={(e) => handleFilterChange("country", e.target.value)}
               className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
             />
           </div>
           <div className="space-y-1.5">
             <label className="text-xs font-medium uppercase text-muted-foreground">Product Line</label>
             <input
               type="text"
               placeholder="Filter by product..."
               value={productFilter}
               onChange={(e) => handleFilterChange("productLine", e.target.value)}
               className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
             />
           </div>
           
           {activeFilterCount > 0 && (
             <div className="col-span-full flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-muted-foreground hover:text-foreground">
                   <X className="w-3.5 h-3.5 mr-1.5" />
                   Clear Filters
                </Button>
             </div>
           )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border bg-muted/30"
                >
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${
                        header.column.getCanSort()
                          ? "cursor-pointer select-none transition-colors hover:text-foreground"
                          : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {header.column.getCanSort() && (
                          <span className="inline-flex">
                            {header.column.getIsSorted() === "asc" ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeStudentColumns.length}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <User className="h-12 w-12 text-muted-foreground/60" />
                      <div>
                        <p className="font-medium text-foreground">
                          No active students found
                        </p>
                         <p className="mt-1 text-sm text-muted-foreground">
                          Try adjusting your filters or search.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={(e) => handleRowClick(row, e)}
                    className="cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total > 0
            ? `Showing ${startItem}-${endItem} of ${total}`
            : "No results"}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                updateSearchParams({
                  pageSize: e.target.value,
                  page: "1",
                });
              }}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-border bg-background p-1.5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 tabular-nums text-muted-foreground">
              Page {page} of {pageCount || 1}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded border border-border bg-background p-1.5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
