"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Settings, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FeaturePermissions } from "@/components/admin/FeaturePermissions";

// ---------------------------------------------------------------------------
// Types (matching API response from GET /api/admin/roles/:roleId?tree=true)
// ---------------------------------------------------------------------------

interface RoleData {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const roleId = params.roleId as string;

  const [role, setRole] = useState<RoleData | null>(null);
  const [featureGrants, setFeatureGrants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await fetch(`/api/admin/roles/${roleId}?tree=true`);
        if (res.status === 404) {
          setError("Role not found");
          return;
        }
        if (!res.ok) {
          setError("Failed to load role");
          return;
        }
        const data = await res.json();
        setRole(data.role);
        setFeatureGrants(data.featureGrants);
      } catch {
        setError("Failed to load role");
      } finally {
        setLoading(false);
      }
    }
    fetchRole();
  }, [roleId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Error state
  if (error || !role) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <button
          onClick={() => router.push("/admin/roles")}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Roles
        </button>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-zinc-300">
            {error || "Role not found"}
          </h2>
          <p className="mt-2 text-zinc-500">
            The role you are looking for does not exist or could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/admin/roles")}
        className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Roles
      </button>

      {/* Role header */}
      <div>
        <div className="flex items-center gap-3">
          <Badge
            style={{
              backgroundColor: role.color + "20",
              color: role.color,
              borderColor: role.color + "40",
            }}
          >
            {role.name}
          </Badge>
          <h1 className="text-2xl font-bold text-white">{role.name}</h1>
        </div>
        {role.description && (
          <p className="mt-1 text-sm text-zinc-400">{role.description}</p>
        )}
      </div>

      {/* Feature Permissions section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-cyan-400" />
          Feature Permissions
        </h2>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <FeaturePermissions
            roleId={roleId}
            initialFeatures={featureGrants}
          />
        </div>
      </div>
    </div>
  );
}
