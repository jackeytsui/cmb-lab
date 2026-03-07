"use client";

import { useState, useEffect } from "react";
import { Trash2, Plus, BookOpen, Crown, Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CourseAccessItem {
  courseId: string;
  courseTitle: string;
  accessTier: "preview" | "full";
  grantedBy: "webhook" | "coach" | "admin";
  expiresAt: string | null;
  createdAt: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
}

interface StudentAccessManagerProps {
  studentId: string;
  studentName: string;
  studentEmail: string;
}

/**
 * StudentAccessManager component - allows coaches to view and manage
 * course access for a specific student.
 *
 * Features:
 * - View current course access with tier/expiry info
 * - Grant new course access
 * - Revoke existing access
 */
export function StudentAccessManager({
  studentId,
  studentName,
  studentEmail,
}: StudentAccessManagerProps) {
  const [currentAccess, setCurrentAccess] = useState<CourseAccessItem[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for granting access
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [accessTier, setAccessTier] = useState<"preview" | "full">("full");
  const [expiresAt, setExpiresAt] = useState("");
  const [grantingAccess, setGrantingAccess] = useState(false);

  // Confirmation state for revoke
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Fetch student's access and all courses on mount
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch in parallel
        const [accessRes, coursesRes] = await Promise.all([
          fetch(`/api/students/${studentId}/access`),
          fetch("/api/courses"),
        ]);

        if (!accessRes.ok) {
          throw new Error("Failed to fetch student access");
        }
        if (!coursesRes.ok) {
          throw new Error("Failed to fetch courses");
        }

        const accessData = await accessRes.json();
        const coursesData = await coursesRes.json();

        setCurrentAccess(accessData.access || []);
        setAllCourses(coursesData.courses || []);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [studentId]);

  // Courses not yet granted to student
  const availableCourses = allCourses.filter(
    (course) => !currentAccess.some((access) => access.courseId === course.id)
  );

  // Grant access handler
  const handleGrantAccess = async () => {
    if (!selectedCourseId) return;

    setGrantingAccess(true);
    setError(null);

    try {
      const response = await fetch(`/api/students/${studentId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourseId,
          accessTier,
          expiresAt: expiresAt || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to grant access");
      }

      const data = await response.json();

      // Add to current access list
      setCurrentAccess((prev) => [...prev, data.access]);

      // Reset form
      setSelectedCourseId("");
      setAccessTier("full");
      setExpiresAt("");
    } catch (err) {
      console.error("Error granting access:", err);
      setError(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setGrantingAccess(false);
    }
  };

  // Revoke access handler
  const handleRevokeAccess = async (courseId: string) => {
    setError(null);

    try {
      const response = await fetch(
        `/api/students/${studentId}/access?courseId=${courseId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke access");
      }

      // Remove from current access list
      setCurrentAccess((prev) =>
        prev.filter((access) => access.courseId !== courseId)
      );
      setConfirmRevoke(null);
    } catch (err) {
      console.error("Error revoking access:", err);
      setError(err instanceof Error ? err.message : "Failed to revoke access");
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return <StudentAccessManagerSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Student header */}
      <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
        <div className="w-10 h-10 rounded-full bg-cyan-600/20 flex items-center justify-center">
          <User className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{studentName}</h2>
          <p className="text-sm text-zinc-400">{studentEmail}</p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Current access list */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Current Course Access
        </h3>

        {currentAccess.length === 0 ? (
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
            <BookOpen className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500">No course access granted yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentAccess.map((access) => (
              <div
                key={access.courseId}
                className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">
                      {access.courseTitle}
                    </span>
                    {/* Access tier badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        access.accessTier === "full"
                          ? "bg-green-600/20 text-green-400 border border-green-600/30"
                          : "bg-yellow-600/20 text-yellow-400 border border-yellow-600/30"
                      }`}
                    >
                      {access.accessTier === "full" && (
                        <Crown className="w-3 h-3" />
                      )}
                      {access.accessTier === "full" ? "Full" : "Preview"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span>Granted by: {access.grantedBy}</span>
                    {access.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires: {formatDate(access.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Revoke button */}
                {confirmRevoke === access.courseId ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRevokeAccess(access.courseId)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmRevoke(null)}
                      className="px-2 py-1 text-xs bg-zinc-700 text-white rounded hover:bg-zinc-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRevoke(access.courseId)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="Revoke access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant access form */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Grant New Access
        </h3>

        {availableCourses.length === 0 ? (
          <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
            <p className="text-zinc-500 text-sm">
              Student has access to all available courses
            </p>
          </div>
        ) : (
          <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-4">
            {/* Course selection */}
            <div>
              <label
                htmlFor="courseSelect"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                Course
              </label>
              <select
                id="courseSelect"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">Select a course...</option>
                {availableCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Access tier selection */}
              <div>
                <label
                  htmlFor="accessTier"
                  className="block text-sm font-medium text-zinc-300 mb-1"
                >
                  Access Tier
                </label>
                <select
                  id="accessTier"
                  value={accessTier}
                  onChange={(e) =>
                    setAccessTier(e.target.value as "preview" | "full")
                  }
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="full">Full Access</option>
                  <option value="preview">Preview Only</option>
                </select>
              </div>

              {/* Expiry date (optional) */}
              <div>
                <label
                  htmlFor="expiresAt"
                  className="block text-sm font-medium text-zinc-300 mb-1"
                >
                  Expires (optional)
                </label>
                <input
                  type="date"
                  id="expiresAt"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Grant button */}
            <button
              onClick={handleGrantAccess}
              disabled={!selectedCourseId || grantingAccess}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {grantingAccess ? "Granting..." : "Grant Access"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loader for StudentAccessManager
 */
function StudentAccessManagerSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
        <Skeleton className="w-10 h-10 rounded-full bg-zinc-700" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 bg-zinc-700" />
          <Skeleton className="h-4 w-48 bg-zinc-700" />
        </div>
      </div>

      {/* Access list skeleton */}
      <div>
        <Skeleton className="h-4 w-40 bg-zinc-700 mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
            >
              <div className="space-y-2">
                <Skeleton className="h-5 w-48 bg-zinc-700" />
                <Skeleton className="h-3 w-32 bg-zinc-700" />
              </div>
              <Skeleton className="h-8 w-8 bg-zinc-700 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Form skeleton */}
      <div>
        <Skeleton className="h-4 w-32 bg-zinc-700 mb-3" />
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-4">
          <Skeleton className="h-10 w-full bg-zinc-700 rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full bg-zinc-700 rounded-lg" />
            <Skeleton className="h-10 w-full bg-zinc-700 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-full bg-zinc-700 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
