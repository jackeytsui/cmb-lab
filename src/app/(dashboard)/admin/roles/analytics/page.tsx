"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  BarChart3,
  ArrowLeft,
  Users,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";

// ---------------------------------------------------------------------------
// Types matching API response
// ---------------------------------------------------------------------------

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  allCourses: boolean;
  activeStudentCount: number;
}

interface ExpiringAssignment {
  userId: string;
  userName: string | null;
  userEmail: string;
  roleName: string;
  roleColor: string;
  expiresAt: string;
}

interface MultiRoleStudent {
  userId: string;
  name: string | null;
  email: string;
  roleCount: number;
  roles: { name: string; color: string; expiresAt: string | null }[];
}

interface AnalyticsData {
  roles: RoleSummary[];
  expiring7d: ExpiringAssignment[];
  expiring30d: ExpiringAssignment[];
  multiRoleStudents: MultiRoleStudent[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoleAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles/analytics");
      if (!res.ok) throw new Error("Failed to fetch role analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error fetching role analytics:", err);
      setError("Failed to load role analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Role Analytics</h1>
        </div>
        <Link
          href="/admin/roles"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Roles
        </Link>
      </div>

      {/* Error */}
      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* Role Summary Cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-300">
          Role Summary
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-5"
              >
                <Skeleton className="mb-3 h-6 w-24 bg-zinc-700" />
                <Skeleton className="mb-2 h-4 w-40 bg-zinc-700" />
                <Skeleton className="h-10 w-16 bg-zinc-700" />
              </div>
            ))}
          </div>
        ) : data && data.roles.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.roles.map((role) => (
              <div
                key={role.id}
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    style={{
                      backgroundColor: role.color + "20",
                      color: role.color,
                      borderColor: role.color + "40",
                    }}
                  >
                    {role.name}
                  </Badge>
                  {role.allCourses && (
                    <span className="text-xs text-emerald-400">
                      All Courses
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="mb-3 truncate text-sm text-zinc-400">
                    {role.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-zinc-500" />
                  <span className="text-3xl font-bold text-cyan-400">
                    {role.activeStudentCount}
                  </span>
                  <span className="text-sm text-zinc-500">
                    active student{role.activeStudentCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No roles created yet</p>
          </div>
        )}
      </section>

      {/* Expiration Warnings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 7-day expirations */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-amber-400">
              Expiring in 7 Days
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-4"
                >
                  <Skeleton className="mb-2 h-4 w-32 bg-zinc-700" />
                  <Skeleton className="h-4 w-48 bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : data && data.expiring7d.length > 0 ? (
            <div className="space-y-2">
              {data.expiring7d.map((item, idx) => (
                <div
                  key={`7d-${idx}`}
                  className="rounded-lg border border-amber-500/20 bg-zinc-800 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {item.userName || item.userEmail}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: item.roleColor + "20",
                            color: item.roleColor,
                            borderColor: item.roleColor + "40",
                          }}
                        >
                          {item.roleName}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-amber-400">
                        {formatDistanceToNow(new Date(item.expiresAt), {
                          addSuffix: true,
                        })}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {format(new Date(item.expiresAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center">
              <CheckCircle className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
              <p className="text-sm text-zinc-500">
                No assignments expiring in the next 7 days
              </p>
            </div>
          )}
        </section>

        {/* 30-day expirations */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-blue-400">
              Expiring in 30 Days
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-4"
                >
                  <Skeleton className="mb-2 h-4 w-32 bg-zinc-700" />
                  <Skeleton className="h-4 w-48 bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : data && data.expiring30d.length > 0 ? (
            <div className="space-y-2">
              {data.expiring30d.map((item, idx) => (
                <div
                  key={`30d-${idx}`}
                  className="rounded-lg border border-blue-500/20 bg-zinc-800 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {item.userName || item.userEmail}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: item.roleColor + "20",
                            color: item.roleColor,
                            borderColor: item.roleColor + "40",
                          }}
                        >
                          {item.roleName}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-blue-400">
                        {formatDistanceToNow(new Date(item.expiresAt), {
                          addSuffix: true,
                        })}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {format(new Date(item.expiresAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center">
              <CheckCircle className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
              <p className="text-sm text-zinc-500">
                No assignments expiring in the next 30 days
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Multi-Role Students */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-300">
          Students with Multiple Roles
        </h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-5"
              >
                <Skeleton className="mb-2 h-5 w-36 bg-zinc-700" />
                <Skeleton className="h-4 w-48 bg-zinc-700" />
              </div>
            ))}
          </div>
        ) : data && data.multiRoleStudents.length > 0 ? (
          <div className="space-y-3">
            {data.multiRoleStudents.map((student) => (
              <div
                key={student.userId}
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-5"
              >
                <div className="mb-3 flex items-center gap-3">
                  <p className="text-sm font-medium text-zinc-100">
                    {student.name || student.email}
                  </p>
                  <Badge
                    variant="outline"
                    className="border-purple-500/40 text-purple-400"
                  >
                    {student.roleCount} roles
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {student.roles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <Badge
                        style={{
                          backgroundColor: role.color + "20",
                          color: role.color,
                          borderColor: role.color + "40",
                        }}
                      >
                        {role.name}
                      </Badge>
                      {role.expiresAt && (
                        <span className="text-xs text-zinc-500">
                          (expires{" "}
                          {format(new Date(role.expiresAt), "MMM d, yyyy")})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">
              No students have multiple roles
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
