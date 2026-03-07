"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
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
  Download,
} from "lucide-react";
import { columns, type StudentRow } from "./columns";
import { StudentBulkActions } from "./StudentBulkActions";
import { AdvancedFilters } from "./AdvancedFilters";
import { FilterPresetManager } from "./FilterPresetManager";

interface StudentDataTableProps {
  data: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search: string;
  filters: {
    tagIds?: string[];
    courseId?: string;
    atRisk?: boolean;
  };
}

export function StudentDataTable({
  data,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
  search,
  filters,
}: StudentDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchInput, setSearchInput] = useState(search);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);

  // Sync external search prop to local input when URL changes
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // URL sync helper -- replaces current URL without polluting history
  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounced search -- 300ms delay before URL update
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const pageCount = Math.ceil(total / pageSize);

  const table = useReactTable({
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ id: sortBy, desc: sortOrder === "desc" }],
      rowSelection,
      columnVisibility: {
        createdAt: false, // Hidden by default
      },
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
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const selectedCount = selectedIds.length;

  // Shift-click range selection handler
  const handleCheckboxClick = useCallback(
    (rowIndex: number, rowId: string, event: React.MouseEvent) => {
      if (event.shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, rowIndex);
        const end = Math.max(lastClickedIndexRef.current, rowIndex);
        const rows = table.getRowModel().rows;
        const newSelection: RowSelectionState = { ...rowSelection };
        for (let i = start; i <= end; i++) {
          const rid = rows[i]?.id;
          if (rid) newSelection[rid] = true;
        }
        setRowSelection(newSelection);
      } else {
        // Toggle single row
        setRowSelection((prev) => {
          const next = { ...prev };
          if (next[rowId]) {
            delete next[rowId];
          } else {
            next[rowId] = true;
          }
          return next;
        });
      }
      lastClickedIndexRef.current = rowIndex;
    },
    [rowSelection, table],
  );

  const handleRowClick = (
    row: Row<StudentRow>,
    event: React.MouseEvent,
  ) => {
    // Don't navigate if clicking checkbox
    if ((event.target as HTMLElement).closest('input[type="checkbox"]')) return;
    router.push(`/admin/users/${row.original.id}`);
  };

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <FilterPresetManager
          currentFilters={Object.fromEntries(searchParams.entries())}
          onPresetLoad={(presetFilters) => {
            // Clear existing filter params then apply preset
            const clearParams: Record<string, string | null> = {
              search: null,
              tagIds: null,
              courseId: null,
              atRisk: null,
              sortBy: null,
              sortOrder: null,
              page: "1",
            };
            // Merge in preset values
            for (const [key, value] of Object.entries(presetFilters)) {
              clearParams[key] = value;
            }
            updateSearchParams(clearParams);
          }}
        />
        <a
          href={`/api/admin/students/export?${searchParams.toString()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </a>
      </div>

      {/* Advanced filters */}
      <AdvancedFilters
        filters={filters}
        onFiltersChange={updateSearchParams}
      />

      {/* Bulk action toolbar */}
      {selectedCount > 0 && (
        <StudentBulkActions
          selectedIds={selectedIds}
          onClearSelection={() => setRowSelection({})}
          onOperationComplete={() => {
            setRowSelection({});
            router.refresh();
          }}
        />
      )}

      {/* Cross-page selection banner */}
      {table.getIsAllPageRowsSelected() && total > pageSize && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-center text-sm text-foreground">
          All {pageSize} students on this page are selected.
          {/* Future: "Select all {total} matching students" link */}
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
                      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${
                        header.column.getCanSort()
                          ? "cursor-pointer select-none transition-colors hover:text-foreground"
                          : ""
                      }`}
                      style={{
                        width:
                          header.id === "select"
                            ? "40px"
                            : undefined,
                      }}
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
                    colSpan={columns.length}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <User className="h-12 w-12 text-muted-foreground/60" />
                      <div>
                        <p className="font-medium text-foreground">
                          No students found
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {search
                            ? "Try a different search term."
                            : "Students will appear here once they sign up."}
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
                    className={`cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/40 ${
                      row.getIsSelected() ? "bg-primary/10" : ""
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3"
                        {...(cell.column.id === "select"
                          ? {
                              onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleCheckboxClick(row.index, row.id, e);
                              },
                            }
                          : {})}
                      >
                        {cell.column.id === "select" ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-border bg-background accent-primary"
                            checked={row.getIsSelected()}
                            readOnly
                          />
                        ) : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
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
          {/* Page size selector */}
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

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-border bg-background p-1.5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
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
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper to get selected student IDs from rowSelection state.
 * Used by bulk action toolbar (Plan 05).
 */
export function getSelectedStudentIds(
  rowSelection: RowSelectionState,
  data: StudentRow[],
): string[] {
  return data.filter((_, index) => rowSelection[data[index]?.id]).map((s) => s.id);
}
