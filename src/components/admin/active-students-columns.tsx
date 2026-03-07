"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User, Mail, Phone, Globe, Activity, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { ActiveStudent } from "@/db/schema/active-students";

export const activeStudentColumns: ColumnDef<ActiveStudent>[] = [
  {
    accessorKey: "firstName",
    header: "Name",
    cell: ({ row }) => {
      const name = `${row.original.firstName || ""} ${row.original.lastName || ""}`.trim() || "Unknown";
      return (
        <div className="flex items-center gap-3 min-w-[180px]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{name}</div>
            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
               {row.original.email}
            </div>
          </div>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => {
       if (!row.original.email) return <span className="text-muted-foreground">--</span>;
       return (
          <div className="flex items-center gap-2 text-sm text-foreground">
             <Mail className="h-3 w-3 text-muted-foreground" />
             <span className="truncate max-w-[150px]">{row.original.email}</span>
          </div>
       );
    },
    enableSorting: true,
  },
   {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => {
       if (!row.original.phone) return <span className="text-muted-foreground">--</span>;
       return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
             <Phone className="h-3 w-3 text-muted-foreground" />
             <span className="truncate">{row.original.phone}</span>
          </div>
       );
    },
    enableSorting: false,
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const tags = row.original.tags;
      if (!tags) return <span className="text-muted-foreground">--</span>;
      // Assume comma separated for now
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      return (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {tagList.slice(0, 2).map((tag, i) => (
            <span key={i} className="max-w-[100px] truncate rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
              {tag}
            </span>
          ))}
           {tagList.length > 2 && (
            <span className="flex items-center px-1 text-[10px] text-muted-foreground">+{tagList.length - 2}</span>
          )}
        </div>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "country",
    header: "Country",
    cell: ({ row }) => {
        if (!row.original.country) return <span className="text-muted-foreground">--</span>;
        return (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Globe className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[100px]">{row.original.country}</span>
            </div>
        );
    },
    enableSorting: true,
  },
  {
      accessorKey: "productLine",
      header: "Product Line",
      cell: ({ row }) => {
          if (!row.original.productLine) return <span className="text-muted-foreground">--</span>;
          return <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">{row.original.productLine}</span>;
      }
  },
   {
    accessorKey: "assignedTo",
    header: "Assigned To",
    cell: ({ row }) => {
        if (!row.original.assignedTo) return <span className="text-muted-foreground">--</span>;
        return (
             <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Briefcase className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{row.original.assignedTo}</span>
            </div>
        );
    }
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => {
        if (!row.original.source) return <span className="text-muted-foreground">--</span>;
        return <span className="max-w-[100px] truncate text-xs text-muted-foreground">{row.original.source}</span>;
    }
  },
  {
    accessorKey: "created",
    header: "Created",
    cell: ({ row }) => {
        const date = row.original.created;
        if (!date) return <span className="text-muted-foreground">--</span>;
        return (
            <div className="flex flex-col text-xs text-muted-foreground">
                <span>{format(new Date(date), "MMM d, yyyy")}</span>
            </div>
        );
    },
    enableSorting: true,
  },
  {
    accessorKey: "updated",
    header: "Updated",
    cell: ({ row }) => {
        const date = row.original.updated;
        if (!date) return <span className="text-muted-foreground">--</span>;
        return <span className="text-xs text-muted-foreground">{format(new Date(date), "MMM d, yyyy")}</span>;
    },
    enableSorting: true,
  },
  {
    accessorKey: "lastActivity",
    header: "Last Activity",
    cell: ({ row }) => {
        if (!row.original.lastActivity) return <span className="text-muted-foreground">--</span>;
        return (
             <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[100px]">{row.original.lastActivity}</span>
            </div>
        );
    },
    enableSorting: true,
  }
];
