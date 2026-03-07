"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Shield,
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  Loader2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RoleForm } from "@/components/admin/RoleForm";
import { toast } from "sonner";

interface RoleWithCount {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  studentCount: number;
  createdAt: string;
}

export default function AdminRolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [deleteConfirmRole, setDeleteConfirmRole] =
    useState<RoleWithCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRoles = useCallback(async (searchQuery?: string) => {
    try {
      const url = searchQuery
        ? `/api/admin/roles?search=${encodeURIComponent(searchQuery)}`
        : "/api/admin/roles";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch roles");
      const data = await res.json();
      setRoles(data.roles);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchRoles(search || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, fetchRoles]);

  const handleDelete = async (roleId: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`, {
        method: "DELETE",
      });
      if (res.status === 409) {
        const data = await res.json();
        toast.error(data.error);
      } else if (!res.ok) {
        toast.error("Failed to delete role");
      } else {
        toast.success("Role deleted");
        setDeleteConfirmRole(null);
        fetchRoles(search || undefined);
      }
    } catch {
      toast.error("Network error -- please try again");
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreateDialog = () => {
    setEditingRole(null);
    setDialogOpen(true);
  };

  const openEditDialog = (role: RoleWithCount) => {
    setEditingRole(role);
    setDialogOpen(true);
  };

  const handleFormSuccess = () => {
    setDialogOpen(false);
    setEditingRole(null);
    fetchRoles(search || undefined);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Roles</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage custom learning access roles. Platform user roles are managed in Users.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">Platform user roles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">Student</Badge>
            <Badge variant="secondary">Coach</Badge>
            <Badge variant="secondary">Admin</Badge>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* Role list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">
            No roles found
          </h2>
          <p className="mt-2 text-muted-foreground">
            {search
              ? "No roles match your search. Try a different query."
              : "Create your first custom role to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => router.push(`/admin/roles/${role.id}`)}
              className="flex cursor-pointer items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              {/* Badge + name */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge
                    style={{
                      backgroundColor: role.color + "20",
                      color: role.color,
                      borderColor: role.color + "40",
                    }}
                  >
                    {role.name}
                  </Badge>
                </div>
                {role.description && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {role.description}
                  </p>
                )}
              </div>

              {/* Student count */}
              <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {role.studentCount} student{role.studentCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Created date */}
              <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
                {formatDistanceToNow(new Date(role.createdAt), {
                  addSuffix: true,
                })}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/admin/roles/${role.id}`);
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  title="Configure permissions"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(role);
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmRole(role);
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditingRole(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole ? "Edit Role" : "Create Role"}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update the role details below."
                : "Fill in the details to create a new role."}
            </DialogDescription>
          </DialogHeader>
          <RoleForm
            role={editingRole}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setDialogOpen(false);
              setEditingRole(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmRole}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmRole(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              {deleteConfirmRole && deleteConfirmRole.studentCount > 0 ? (
                <>
                  This role is assigned to{" "}
                  <strong className="text-foreground">
                    {deleteConfirmRole.studentCount}
                  </strong>{" "}
                  student{deleteConfirmRole.studentCount !== 1 ? "s" : ""}.
                  Remove all assignments before deleting.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <strong className="text-foreground">
                    {deleteConfirmRole?.name}
                  </strong>
                  ? This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmRole(null)}
            >
              {deleteConfirmRole && deleteConfirmRole.studentCount > 0
                ? "Close"
                : "Cancel"}
            </Button>
            {deleteConfirmRole && deleteConfirmRole.studentCount === 0 && (
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteConfirmRole.id)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
