"use client";

import { useState, useEffect } from "react";
import { Loader2, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { FEATURE_LABELS } from "@/lib/feature-labels";

interface CourseGrant {
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  lessonId: string | null;
  accessTier: "preview" | "full";
}

interface AttributionRole {
  roleId: string;
  roleName: string;
  roleColor: string;
  allCourses: boolean;
  expiresAt: string | null;
  courses: CourseGrant[];
  features: string[];
}

interface StudentAccessAttributionProps {
  studentId: string;
}

export function StudentAccessAttribution({
  studentId,
}: StudentAccessAttributionProps) {
  const [roles, setRoles] = useState<AttributionRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchAttribution() {
      try {
        const res = await fetch(
          `/api/admin/roles/analytics?studentId=${studentId}`
        );
        if (!res.ok) throw new Error("Failed to load attribution data");
        const data = await res.json();
        setRoles(data.attribution ?? []);
        // Expand all roles by default
        setExpandedRoles(
          new Set((data.attribution ?? []).map((r: AttributionRole) => r.roleId))
        );
      } catch {
        setError("Failed to load access attribution");
      } finally {
        setLoading(false);
      }
    }
    fetchAttribution();
  }, [studentId]);

  const toggleRole = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (roles.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No roles assigned to this student</p>
    );
  }

  return (
    <div className="space-y-3">
      {roles.map((role) => {
        const isExpanded = expandedRoles.has(role.roleId);
        const Chevron = isExpanded ? ChevronDown : ChevronRight;

        return (
          <div
            key={role.roleId}
            className="border border-zinc-700 rounded-lg overflow-hidden"
          >
            {/* Role header */}
            <button
              onClick={() => toggleRole(role.roleId)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
            >
              <Chevron className="w-4 h-4 text-zinc-400 shrink-0" />
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
              </Badge>
              {role.expiresAt && (
                <span className="text-xs text-zinc-500 ml-auto">
                  Expires: {format(new Date(role.expiresAt), "MMM d, yyyy")}
                </span>
              )}
              {!role.expiresAt && (
                <span className="text-xs text-green-500/70 ml-auto">
                  No expiration
                </span>
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-zinc-700/50 space-y-3">
                {/* All Courses indicator */}
                {role.allCourses && (
                  <div className="flex items-center gap-2 text-sm text-cyan-400">
                    <Globe className="w-4 h-4" />
                    <span>All Courses</span>
                  </div>
                )}

                {/* Course grants */}
                {!role.allCourses && role.courses.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                      Courses
                    </h4>
                    <div className="space-y-1">
                      {role.courses.map((course, i) => (
                        <div
                          key={`${course.courseId}-${course.moduleId}-${course.lessonId}-${i}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="text-zinc-300">
                            {course.courseTitle}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 px-1.5 ${
                              course.accessTier === "full"
                                ? "text-green-400 border-green-400/30"
                                : "text-amber-400 border-amber-400/30"
                            }`}
                          >
                            {course.accessTier}
                          </Badge>
                          {course.moduleId && !course.lessonId && (
                            <span className="text-[10px] text-zinc-500">
                              (module-level)
                            </span>
                          )}
                          {course.lessonId && (
                            <span className="text-[10px] text-zinc-500">
                              (lesson-level)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!role.allCourses && role.courses.length === 0 && (
                  <p className="text-xs text-zinc-500">No course grants</p>
                )}

                {/* Feature grants */}
                {role.features.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                      Features
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {role.features.map((key) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="text-[10px] py-0 px-1.5 text-zinc-300 border-zinc-600"
                        >
                          {FEATURE_LABELS[key] ?? key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {role.features.length === 0 && (
                  <p className="text-xs text-zinc-500">No feature grants</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
