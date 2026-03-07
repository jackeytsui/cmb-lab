"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ContentList } from "@/components/admin/ContentList";

interface CourseItem {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  sortOrder: number;
  moduleCount: number;
  createdAt: string;
}

/**
 * Admin Courses List page - displays all courses with management options.
 */
export default function AdminCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/courses");
      if (!response.ok) {
        if (response.status === 403) {
          router.push("/dashboard");
          return;
        }
        throw new Error("Failed to fetch courses");
      }
      const data = await response.json();
      setCourses(data.courses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleDelete = async (courseId: string) => {
    if (!confirm("Are you sure you want to delete this course?")) return;

    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete course");
      fetchCourses();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete course");
    }
  };

  const renderCourse = (course: CourseItem) => (
    <div className="flex flex-1 items-center justify-between">
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/courses/${course.id}`}
          className="font-semibold text-white hover:text-blue-400"
        >
          {course.title}
        </Link>
        <div className="mt-1 flex items-center gap-3 text-sm text-zinc-400">
          <span>{course.moduleCount} modules</span>
          {course.isPublished ? (
            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
              Published
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Draft
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/courses/${course.id}`}>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            Edit
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            handleDelete(course.id);
          }}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          Delete
        </Button>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-white">
            Admin
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-200">Courses</span>
        </nav>

        {/* Page header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Courses</h1>
            <p className="mt-2 text-zinc-400">
              Manage your course catalog
            </p>
          </div>
          <Link href="/admin/courses/new">
            <Button>Add Course</Button>
          </Link>
        </header>

        {/* Error states */}
        {error && (
          <ErrorAlert message={error} className="mb-6" onRetry={fetchCourses} />
        )}
        {deleteError && (
          <ErrorAlert
            message={deleteError}
            className="mb-6"
            onRetry={() => setDeleteError(null)}
          />
        )}

        {/* Course list */}
        <ContentList
          items={courses}
          renderItem={renderCourse}
          emptyMessage="No courses yet. Click 'Add Course' to create your first course."
          loading={loading}
        />
      </div>
  );
}
