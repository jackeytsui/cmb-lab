"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { format } from "date-fns";

interface AssignedRole {
  id: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  roleDescription: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface AvailableRole {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface StudentRoleAssignmentProps {
  studentId: string;
}

export function StudentRoleAssignment({ studentId }: StudentRoleAssignmentProps) {
  const [assigned, setAssigned] = useState<AssignedRole[]>([]);
  const [available, setAvailable] = useState<AvailableRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch(`/api/admin/students/${studentId}/roles`);
        if (res.ok) {
          const data = await res.json();
          setAssigned(data.roles);
          setAvailable(data.availableRoles);
        } else {
          toast.error("Failed to load roles");
        }
      } catch {
        toast.error("Failed to load roles");
      } finally {
        setLoading(false);
      }
    }
    fetchRoles();
  }, [studentId]);

  const handleAssign = async () => {
    if (!selectedRoleId) return;
    setAssigning(true);

    // Optimistic: move role from available to assigned
    const role = available.find((r) => r.id === selectedRoleId);
    if (!role) {
      setAssigning(false);
      return;
    }

    const optimisticAssignment: AssignedRole = {
      id: crypto.randomUUID(),
      roleId: role.id,
      roleName: role.name,
      roleColor: role.color,
      roleDescription: role.description,
      expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59.999Z").toISOString() : null,
      createdAt: new Date().toISOString(),
    };

    const previousAssigned = [...assigned];
    const previousAvailable = [...available];

    setAssigned((prev) => [...prev, optimisticAssignment]);
    setAvailable((prev) => prev.filter((r) => r.id !== selectedRoleId));
    setSelectedRoleId("");
    setExpiresAt("");

    try {
      const res = await fetch(`/api/admin/students/${studentId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: role.id,
          expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59.999Z").toISOString() : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to assign role");

      const data = await res.json();
      // Replace optimistic entry with server response
      if (data.assignment) {
        setAssigned((prev) =>
          prev.map((r) => (r.roleId === role.id ? data.assignment : r))
        );
      }
      toast.success("Role assigned");
    } catch {
      // Revert on error
      setAssigned(previousAssigned);
      setAvailable(previousAvailable);
      toast.error("Failed to assign role");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (roleId: string) => {
    // Optimistic: remove from assigned, add back to available
    const previousAssigned = [...assigned];
    const previousAvailable = [...available];

    const removedRole = assigned.find((r) => r.roleId === roleId);
    setAssigned((prev) => prev.filter((r) => r.roleId !== roleId));

    if (removedRole) {
      setAvailable((prev) => [
        ...prev,
        {
          id: removedRole.roleId,
          name: removedRole.roleName,
          color: removedRole.roleColor,
          description: removedRole.roleDescription,
        },
      ]);
    }

    try {
      const res = await fetch(`/api/admin/students/${studentId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });

      if (!res.ok) throw new Error("Failed to remove role");
      toast.success("Role removed");
    } catch {
      // Revert on error
      setAssigned(previousAssigned);
      setAvailable(previousAvailable);
      toast.error("Failed to remove role");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Assigned roles list */}
      {assigned.length === 0 ? (
        <p className="text-zinc-500 text-sm">No roles assigned</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {assigned.map((role) => (
            <div key={role.roleId} className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-xs py-0.5 px-2 border"
                style={{
                  backgroundColor: `${role.roleColor}20`,
                  color: role.roleColor,
                  borderColor: `${role.roleColor}40`,
                }}
              >
                {role.roleName}
                <button
                  onClick={() => handleRemove(role.roleId)}
                  className="ml-1.5 hover:opacity-70 transition-opacity"
                  aria-label={`Remove ${role.roleName}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
              {role.expiresAt && (
                <span className="text-[11px] text-zinc-500">
                  Expires: {format(new Date(role.expiresAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assignment form */}
      <div className="flex items-center gap-3">
        <select
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none min-w-[180px]"
          disabled={available.length === 0 || assigning}
        >
          <option value="">
            {available.length === 0 ? "All roles assigned" : "Select a role..."}
          </option>
          {available.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none [color-scheme:dark]"
          placeholder="Expiration (optional)"
          disabled={assigning}
        />

        <button
          onClick={handleAssign}
          disabled={!selectedRoleId || assigning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Assign
        </button>
      </div>
    </div>
  );
}
