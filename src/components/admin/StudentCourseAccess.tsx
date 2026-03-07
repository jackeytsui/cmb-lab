"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Course {
  id: string;
  title: string;
}

interface Access {
  courseId: string;
  accessTier: "preview" | "full";
  expiresAt: string | null;
}

interface StudentCourseAccessProps {
  studentId: string;
}

export function StudentCourseAccess({ studentId }: StudentCourseAccessProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [access, setAccess] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin/students/${studentId}/access`);
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses);
          setAccess(data.access);
        } else {
          toast.error("Failed to load access data");
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [studentId]);

  const handleToggleAccess = async (courseId: string, hasAccess: boolean) => {
    // Optimistic update
    const previousAccess = [...access];
    if (hasAccess) {
      setAccess((prev) => prev.filter((a) => a.courseId !== courseId));
    } else {
      setAccess((prev) => [
        ...prev,
        { courseId, accessTier: "full", expiresAt: null },
      ]);
    }

    try {
      const res = await fetch(`/api/admin/students/${studentId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          action: hasAccess ? "revoke" : "grant",
        }),
      });

      if (!res.ok) {
        throw new Error("Update failed");
      }
      toast.success(hasAccess ? "Access revoked" : "Access granted");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update access");
      setAccess(previousAccess); // Revert
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
      {courses.length === 0 ? (
        <p className="text-zinc-500 text-sm">No courses available.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => {
            const hasAccess = access.some((a) => a.courseId === course.id);
            return (
              <div
                key={course.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  hasAccess
                    ? "bg-cyan-950/20 border-cyan-800/50"
                    : "bg-zinc-900/30 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      hasAccess ? "bg-cyan-500" : "bg-zinc-700"
                    }`}
                  />
                  <span
                    className={`font-medium ${
                      hasAccess ? "text-cyan-100" : "text-zinc-400"
                    }`}
                  >
                    {course.title}
                  </span>
                </div>
                <Button
                  variant={hasAccess ? "destructive" : "default"}
                  size="sm"
                  onClick={() => handleToggleAccess(course.id, hasAccess)}
                  className={`h-8 px-3 text-xs ${
                    hasAccess
                      ? "bg-red-950/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 border border-red-900/50"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500/50"
                  }`}
                >
                  {hasAccess ? (
                    <>
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      Revoke
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3 mr-1.5" />
                      Grant Access
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
