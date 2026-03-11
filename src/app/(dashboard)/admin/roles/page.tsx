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
  ChevronDown,
  ChevronRight,
  Crown,
  GraduationCap,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RoleForm } from "@/components/admin/RoleForm";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleWithCount {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  studentCount: number;
  createdAt: string;
}

interface PlatformRole {
  role: string;
  label: string;
  description: string;
  userCount: number;
  features: string[];
}

// ---------------------------------------------------------------------------
// Feature list (matching FEATURE_KEYS from permissions.ts)
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    key: "ai_conversation",
    label: "AI Conversation Bot",
    description: "Voice practice with AI tutor",
  },
  {
    key: "practice_sets",
    label: "Practice Sets",
    description: "Interactive exercises and quizzes",
  },
  {
    key: "dictionary_reader",
    label: "Dictionary & Reader",
    description: "Built-in Chinese dictionary and text reader",
  },
  {
    key: "listening_lab",
    label: "YouTube Listening Lab",
    description: "YouTube-based listening practice",
  },
  {
    key: "coaching_material",
    label: "Coaching Material",
    description: "Coach-created learning materials",
  },
  {
    key: "video_threads",
    label: "Video Threads",
    description: "Interactive video response activities",
  },
  {
    key: "certificates",
    label: "Certificates",
    description: "Course completion certificates",
  },
  {
    key: "ai_chat",
    label: "AI Chat",
    description: "Text-based AI conversation assistant",
  },
];

// ---------------------------------------------------------------------------
// Platform Role Card icons & colors
// ---------------------------------------------------------------------------

const ROLE_META: Record<
  string,
  { icon: typeof Crown; color: string; badgeBg: string; badgeText: string }
> = {
  admin: {
    icon: Crown,
    color: "text-amber-500",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-500",
  },
  coach: {
    icon: UserCog,
    color: "text-blue-500",
    badgeBg: "bg-blue-500/10",
    badgeText: "text-blue-500",
  },
  student: {
    icon: GraduationCap,
    color: "text-emerald-500",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-500",
  },
};

// ---------------------------------------------------------------------------
// PlatformRoleCard
// ---------------------------------------------------------------------------

function PlatformRoleCard({ platformRole }: { platformRole: PlatformRole }) {
  const [expanded, setExpanded] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(
    () => new Set(platformRole.features)
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const isAdmin = platformRole.role === "admin";
  const meta = ROLE_META[platformRole.role] ?? ROLE_META.student;
  const Icon = meta.icon;

  // Sync if parent data changes
  useEffect(() => {
    setEnabledFeatures(new Set(platformRole.features));
  }, [platformRole.features]);

  const onToggle = useCallback(
    async (featureKey: string, enabled: boolean) => {
      if (isAdmin) return;

      const previousFeatures = new Set(enabledFeatures);
      setEnabledFeatures((prev) => {
        const next = new Set(prev);
        if (enabled) {
          next.add(featureKey);
        } else {
          next.delete(featureKey);
        }
        return next;
      });

      setSavingKey(featureKey);
      try {
        const res = await fetch(
          `/api/admin/platform-roles/${platformRole.role}/features`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ featureKey, enabled }),
          }
        );
        if (!res.ok) throw new Error("Request failed");
        toast.success("Feature updated");
      } catch {
        setEnabledFeatures(previousFeatures);
        toast.error("Failed to update feature");
      } finally {
        setSavingKey(null);
      }
    },
    [platformRole.role, enabledFeatures, isAdmin]
  );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"
      >
        <div className={`shrink-0 ${meta.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {platformRole.label}
            </span>
            <Badge
              variant="secondary"
              className={`${meta.badgeBg} ${meta.badgeText} border-0 text-xs`}
            >
              {platformRole.role}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {platformRole.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {platformRole.userCount} user
              {platformRole.userCount !== 1 ? "s" : ""}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded feature toggles */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Feature Access
            {isAdmin && (
              <span className="ml-2 normal-case font-normal">
                (all features enabled for admins)
              </span>
            )}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const isEnabled = isAdmin || enabledFeatures.has(feature.key);
              const isSaving = savingKey === feature.key;

              return (
                <div
                  key={feature.key}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    isAdmin
                      ? "border-border/50 bg-muted/30"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p
                      className={`text-sm font-medium ${
                        isAdmin
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {feature.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSaving && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={isEnabled}
                      disabled={isAdmin}
                      onCheckedChange={(checked) =>
                        onToggle(feature.key, checked)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminRolesPage() {
  const router = useRouter();

  // Student Tiers state (formerly "roles")
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [deleteConfirmRole, setDeleteConfirmRole] =
    useState<RoleWithCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Platform Roles state
  const [platformRoles, setPlatformRoles] = useState<PlatformRole[]>([]);
  const [isPlatformLoading, setIsPlatformLoading] = useState(true);

  // Fetch platform roles
  const fetchPlatformRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/platform-roles");
      if (!res.ok) throw new Error("Failed to fetch platform roles");
      const data = await res.json();
      setPlatformRoles(data.platformRoles);
    } catch {
      toast.error("Failed to load platform roles");
    } finally {
      setIsPlatformLoading(false);
    }
  }, []);

  // Fetch student tiers
  const fetchRoles = useCallback(async (searchQuery?: string) => {
    try {
      const url = searchQuery
        ? `/api/admin/roles?search=${encodeURIComponent(searchQuery)}`
        : "/api/admin/roles";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch tiers");
      const data = await res.json();
      setRoles(data.roles);
    } catch {
      toast.error("Failed to load student tiers");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPlatformRoles();
    fetchRoles();
  }, [fetchPlatformRoles, fetchRoles]);

  // Debounced search for tiers
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
        toast.error("Failed to delete tier");
      } else {
        toast.success("Tier deleted");
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
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Roles &amp; Student Tiers
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure platform role feature access and manage student learning
          tiers.
        </p>
      </div>

      {/* ================================================================= */}
      {/* Section 1: Platform Roles */}
      {/* ================================================================= */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Platform Roles
        </h2>
        {isPlatformLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {platformRoles.map((pr) => (
              <PlatformRoleCard key={pr.role} platformRole={pr} />
            ))}
          </div>
        )}
      </section>

      {/* ================================================================= */}
      {/* Section 2: Student Tiers */}
      {/* ================================================================= */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Student Tiers
        </h2>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tiers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Tier
          </Button>
        </div>

        {/* Tier list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground">
              No tiers found
            </h3>
            <p className="mt-2 text-muted-foreground">
              {search
                ? "No tiers match your search. Try a different query."
                : "Create your first student tier to get started."}
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
                    {role.studentCount} student
                    {role.studentCount !== 1 ? "s" : ""}
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
      </section>

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
              {editingRole ? "Edit Tier" : "Create Tier"}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update the tier details below."
                : "Fill in the details to create a new student tier."}
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
            <DialogTitle>Delete Tier</DialogTitle>
            <DialogDescription>
              {deleteConfirmRole && deleteConfirmRole.studentCount > 0 ? (
                <>
                  This tier is assigned to{" "}
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
