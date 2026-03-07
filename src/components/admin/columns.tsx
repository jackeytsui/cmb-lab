"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export interface StudentRow {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  coursesEnrolled: number;
  completionPercent: number;
  lastActive: string | null;
  tags: { id: string; name: string; color: string; type: "coach" | "system" }[];
  roles: { id: string; name: string; color: string; expiresAt: string | null }[];
}

export const columns: ColumnDef<StudentRow>[] = [
  // 1. Select (checkbox) column
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border-border bg-background accent-primary"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) {
            el.indeterminate = table.getIsSomePageRowsSelected();
          }
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border-border bg-background accent-primary"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    enableSorting: false,
    enableColumnFilter: false,
    size: 40,
  },

  // 2. Name column
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const displayName =
        row.original.name || row.original.email.split("@")[0];
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.email}
            </div>
          </div>
        </div>
      );
    },
  },

  // 3. Courses column
  {
    accessorKey: "coursesEnrolled",
    header: "Courses",
    cell: ({ getValue }) => (
      <span className="text-foreground">{getValue<number>()}</span>
    ),
    enableSorting: false,
  },

  // 4. Progress column
  {
    accessorKey: "completionPercent",
    header: "Progress",
    cell: ({ getValue }) => {
      const percent = getValue<number>();
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <span className="w-10 tabular-nums text-xs text-muted-foreground">
            {Math.round(percent)}%
          </span>
        </div>
      );
    },
  },

  // 5. Last Active column
  {
    accessorKey: "lastActive",
    header: "Last Active",
    cell: ({ getValue }) => {
      const lastActive = getValue<string | null>();
      if (!lastActive) {
        return <span className="text-muted-foreground">Never</span>;
      }
      const date = new Date(lastActive);
      const daysSince =
        (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      const textColor =
        daysSince > 14
          ? "text-red-400"
          : daysSince > 7
            ? "text-amber-400"
            : "text-foreground";
      return (
        <span className={textColor}>
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      );
    },
  },

  // 6. Tags column
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ getValue }) => {
      const tags = getValue<StudentRow["tags"]>();
      if (!tags || tags.length === 0) {
        return <span className="text-muted-foreground">--</span>;
      }
      const visible = tags.slice(0, 3);
      const overflow = tags.length - 3;
      return (
        <div className="flex flex-wrap items-center gap-1">
          {visible.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
              style={{
                backgroundColor: `${tag.color}33`,
                color: tag.color,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[11px] text-muted-foreground">+{overflow} more</span>
          )}
        </div>
      );
    },
    enableSorting: false,
  },

  // 7. Roles column
  {
    accessorKey: "roles",
    header: "Roles",
    cell: ({ getValue }) => {
      const roles = getValue<StudentRow["roles"]>();
      if (!roles || roles.length === 0) {
        return <span className="text-muted-foreground">--</span>;
      }
      return (
        <div className="flex flex-wrap items-center gap-1">
          {roles.map((role) => (
            <Badge
              key={role.id}
              variant="outline"
              className="text-[11px] py-0 border"
              style={{
                backgroundColor: `${role.color}20`,
                color: role.color,
                borderColor: `${role.color}40`,
              }}
            >
              {role.name}
            </Badge>
          ))}
        </div>
      );
    },
    enableSorting: false,
  },

  // 8. Joined column (hidden by default)
  {
    accessorKey: "createdAt",
    header: "Joined",
    cell: ({ getValue }) => {
      const date = getValue<string>();
      return (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </span>
      );
    },
    enableHiding: true,
  },
];
