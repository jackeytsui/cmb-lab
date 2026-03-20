"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { CourseForm } from "@/components/admin/CourseForm";
import { ContentList } from "@/components/admin/ContentList";
import { CourseContentImporter } from "@/components/admin/CourseContentImporter";
import type { Course, Module } from "@/db/schema/courses";

interface CourseWithModules extends Course {
  modules: (Module & { lessons: { id: string }[] })[];
}

interface PageProps {
  params: Promise<{ courseId: string }>;
}

/**
 * Admin Course Detail page - edit course and manage modules.
 */
export default function AdminCourseDetailPage({ params }: PageProps) {
  const { courseId } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<CourseWithModules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchCourse = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/courses/${courseId}`);
      if (!response.ok) {
        if (response.status === 403) {
          router.push("/dashboard");
          return;
        }
        if (response.status === 404) {
          router.push("/admin/courses");
          return;
        }
        throw new Error("Failed to fetch course");
      }
      const data = await response.json();
      setCourse(data.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [courseId, router]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const handleReorderModules = async (
    items: { id: string; sortOrder: number }[]
  ) => {
    const response = await fetch("/api/admin/modules/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error("Failed to reorder modules");
    fetchCourse();
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm("Are you sure you want to delete this module?")) return;

    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete module");
      fetchCourse();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete module");
    }
  };

  const renderModule = (module: Module & { lessons: { id: string }[] }) => (
    <div className="flex flex-1 items-center justify-between">
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/courses/${courseId}/modules/${module.id}`}
          className="font-semibold text-white hover:text-blue-400"
        >
          {module.title}
        </Link>
        <p className="mt-1 text-sm text-zinc-400">
          {module.lessons?.length || 0} lessons
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/courses/${courseId}/modules/${module.id}`}>
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
            handleDeleteModule(module.id);
          }}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          Delete
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-32 rounded bg-zinc-700" />
          <div className="mb-8 h-10 w-64 rounded bg-zinc-700" />
          <div className="h-48 rounded-lg bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorAlert message={error || "Course not found"} onRetry={fetchCourse} />
        <Link href="/admin/courses" className="mt-4 inline-block">
          <Button variant="outline">Back to Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-white">
            Admin
          </Link>
          <span className="mx-2">/</span>
          <Link href="/admin/courses" className="hover:text-white">
            Courses
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-200">{course.title}</span>
        </nav>

        {/* Page header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{course.title}</h1>
            <div className="mt-2 flex items-center gap-3 text-zinc-400">
              {course.isPublished ? (
                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  Published
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                  Draft
                </span>
              )}
              <span>{course.modules?.length || 0} modules</span>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowForm(!showForm)}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            {showForm ? "Hide Details" : "Edit Details"}
          </Button>
        </header>

        {/* Delete error */}
        {deleteError && (
          <ErrorAlert
            message={deleteError}
            className="mb-4"
            onRetry={() => setDeleteError(null)}
          />
        )}

        {/* Course edit form (collapsible) */}
        {showForm && (
          <div className="mb-8">
            <CourseForm
              course={course}
              onSuccess={() => {
                fetchCourse();
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <CourseContentImporter
          courseId={courseId}
          onImported={() => {
            fetchCourse();
          }}
        />

        {/* Modules section */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Modules</h2>
            <Link href={`/admin/courses/${courseId}/modules/new`}>
              <Button>Add Module</Button>
            </Link>
          </div>

          <ContentList
            items={course.modules || []}
            renderItem={renderModule}
            emptyMessage="No modules yet. Click 'Add Module' to create your first module."
            onReorder={handleReorderModules}
          />
        </section>
      </div>
  );
}
